package app.magneteye.capture

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Sensor capture for Magnet Eye (Architecture 3.3, SRS 4.4, Phase 6 ARCore).
 *
 * Every reading keeps its hardware timestamp (SensorEvent.timestamp or Frame.timestamp,
 * the elapsedRealtimeNanos clock), stored relative to [originNs] so values stay exact as JS doubles.
 * Readings are buffered here and handed to JS in one call when a recording stops; only a throttled live
 * sample crosses the bridge while streaming.
 */
class MagnetCaptureModule : Module() {
  private val originNs = SystemClock.elapsedRealtimeNanos()
  private val lock = Any()

  private var thread: HandlerThread? = null
  private var streaming = false
  private var recording = false
  private var recordStartNs = 0L

  // Row layouts (relative t in ns first):
  private val mag = Rows(7) // t, uncal x y z, bias x y z (µT)
  private val rot = Rows(5) // t, qw qx qy qz (game rotation vector, phone -> world)
  private val acc = Rows(4) // t, x y z (m/s²)
  private val gyr = Rows(4) // t, x y z (rad/s)

  // ARCore tracking (Phase 6):
  // arcorePos: t, px, py, pz, stateCode (1=tracking, 2=limited, 3=lost), confidence (0..1)
  private val arcorePos = Rows(6)
  // arcoreRot: t, qw, qx, qy, qz (camera pose quaternion)
  private val arcoreRot = Rows(5)
  private var arSession: Session? = null
  private var arcoreRunning = false
  private var arcoreThread: HandlerThread? = null
  private var detectedTableZ: Double? = null
  private var lastArcoreTracking = false
  private var lastArcorePlane = false

  // Live view state.
  private val lastMag = DoubleArray(3)
  private val lastBias = DoubleArray(3)
  private val lastQuat = doubleArrayOf(1.0, 0.0, 0.0, 0.0)
  private var lastEmitNs = 0L
  private val magTimes = LongArray(RATE_WINDOW)
  private var magTimesCount = 0L
  private var magSensorType = Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED

  private val sensorManager: SensorManager
    get() = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      ?: throw CodedException("ERR_NO_SENSOR_SERVICE", "Sensor service unavailable", null)

  private val listener = object : SensorEventListener {
    override fun onSensorChanged(e: SensorEvent) = handle(e)
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
  }

  override fun definition() = ModuleDefinition {
    Name("MagnetCapture")

    Events("onSample")

    Constant("clockOriginNs") { originNs.toString() }

    Function("getCapabilities") { capabilities() }

    Function("getArcoreStatus") { checkArcoreAvailability() }

    Function("startStreaming") { startStreaming() }

    Function("stopStreaming") { stopStreaming() }

    Function("startArcore") { startArcoreTracking() }

    Function("stopArcore") { stopArcoreTracking() }

    Function("startRecording") {
      if (!streaming) startStreaming()
      synchronized(lock) {
        mag.clear(); rot.clear(); acc.clear(); gyr.clear()
        arcorePos.clear(); arcoreRot.clear()
        recordStartNs = SystemClock.elapsedRealtimeNanos() - originNs
        recording = true
      }
    }

    Function("stopRecording") {
      synchronized(lock) {
        recording = false
        val out = mapOf(
          "startNs" to recordStartNs.toDouble(),
          "stopNs" to (SystemClock.elapsedRealtimeNanos() - originNs).toDouble(),
          "magSensor" to if (magSensorType == Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED) "uncalibrated" else "calibrated",
          "mag" to mag.toArray(),
          "rot" to rot.toArray(),
          "acc" to acc.toArray(),
          "gyr" to gyr.toArray(),
          "arcorePos" to arcorePos.toArray(),
          "arcoreRot" to arcoreRot.toArray(),
          "tableZ" to (detectedTableZ ?: 0.0),
          "overflow" to (mag.overflow || rot.overflow || acc.overflow || gyr.overflow || arcorePos.overflow || arcoreRot.overflow),
        )
        mag.clear(); rot.clear(); acc.clear(); gyr.clear()
        arcorePos.clear(); arcoreRot.clear()
        out
      }
    }

    Function("isRecording") { synchronized(lock) { recording } }

    OnDestroy {
      stopStreaming()
      stopArcoreTracking()
    }
  }

  private fun checkArcoreAvailability(): String {
    val ctx = appContext.reactContext ?: return "unsupported"
    return try {
      val arCore = ArCoreApk.getInstance()
      var availability = arCore.checkAvailability(ctx)
      var attempts = 0
      while (availability.isTransient && attempts < 10) {
        Thread.sleep(50)
        availability = arCore.checkAvailability(ctx)
        attempts++
      }
      when (availability) {
        ArCoreApk.Availability.SUPPORTED_INSTALLED -> "ready"
        ArCoreApk.Availability.SUPPORTED_NOT_INSTALLED,
        ArCoreApk.Availability.SUPPORTED_APK_TOO_OLD -> "needs_install"
        ArCoreApk.Availability.UNSUPPORTED_DEVICE_NOT_CAPABLE -> "unsupported"
        else -> if (availability.isSupported) "needs_install" else "unsupported"
      }
    } catch (e: Exception) {
      "unsupported"
    }
  }

  private fun startArcoreTracking() {
    synchronized(lock) {
      if (arcoreRunning) return
      val act = appContext.currentActivity ?: throw CodedException("ERR_NO_ACTIVITY", "Activity is not available", null)
      val ctx = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is not available", null)
      if (ctx.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("ERR_CAMERA_PERMISSION", "Camera permission is required for ARCore tracking", null)
      }

      val session = try {
        Session(act).apply {
          val cfg = Config(this).apply {
            planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
            updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
            focusMode = Config.FocusMode.FIXED
            lightEstimationMode = Config.LightEstimationMode.DISABLED
          }
          configure(cfg)
        }
      } catch (e: Exception) {
        throw CodedException("ERR_ARCORE_INIT", "Failed to initialize ARCore session: ${e.message}", e)
      }
      arSession = session

      val t = HandlerThread("magnet-arcore").also { it.start() }
      arcoreThread = t
      val handler = Handler(t.looper)
      arcoreRunning = true
      detectedTableZ = null

      handler.post {
        runArcoreLoop(session)
      }
    }
  }

  private fun stopArcoreTracking() {
    synchronized(lock) {
      if (!arcoreRunning && arSession == null) return
      arcoreRunning = false
      arcoreThread?.quitSafely()
      arcoreThread = null
      arSession = null
      lastArcoreTracking = false
      lastArcorePlane = false
    }
  }

  private fun runArcoreLoop(session: Session) {
    val dpy = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    EGL14.eglInitialize(dpy, null, 0, null, 0)
    val attribs = intArrayOf(
      EGL14.EGL_RED_SIZE, 8,
      EGL14.EGL_GREEN_SIZE, 8,
      EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGL14.EGL_NONE
    )
    val configs = arrayOfNulls<EGLConfig>(1)
    val numConfigs = IntArray(1)
    EGL14.eglChooseConfig(dpy, attribs, 0, configs, 0, 1, numConfigs, 0)
    val ctxAttribs = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
    val eglCtx = EGL14.eglCreateContext(dpy, configs[0], EGL14.EGL_NO_CONTEXT, ctxAttribs, 0)
    val pbufAttribs = intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE)
    val eglSurf = EGL14.eglCreatePbufferSurface(dpy, configs[0], pbufAttribs, 0)
    EGL14.eglMakeCurrent(dpy, eglSurf, eglSurf, eglCtx)

    val texIds = IntArray(1)
    GLES20.glGenTextures(1, texIds, 0)
    session.setCameraTextureNames(texIds)

    try {
      session.resume()
    } catch (e: Exception) {
      synchronized(lock) { arcoreRunning = false }
      return
    }

    while (arcoreRunning) {
      try {
        val frame = session.update()
        val camera = frame.camera
        val t = frame.timestamp - originNs
        val state = camera.trackingState
        val isTracking = state == TrackingState.TRACKING
        val pose = camera.displayOrientedPose
        val q = pose.rotationQuaternion // FloatArray [qx, qy, qz, qw]
        val qw = q[3].toDouble()
        val qx = q[0].toDouble()
        val qy = q[1].toDouble()
        val qz = q[2].toDouble()
        val tx = pose.tx().toDouble()
        val ty = pose.ty().toDouble()
        val tz = pose.tz().toDouble()
        val stateCode = when (state) {
          TrackingState.TRACKING -> 1.0
          TrackingState.PAUSED -> 2.0
          TrackingState.STOPPED -> 3.0
        }
        val conf = if (isTracking) 1.0 else 0.0

        // Horizontal plane detection for table z
        val planes = session.getAllTrackables(Plane::class.java)
        var hasPlane = false
        for (p in planes) {
          if (p.type == Plane.Type.HORIZONTAL_UPWARD_FACING && p.trackingState == TrackingState.TRACKING) {
            hasPlane = true
            val pz = p.centerPose.tz().toDouble()
            synchronized(lock) {
              if (detectedTableZ == null || pz < detectedTableZ!!) {
                detectedTableZ = pz
              }
            }
          }
        }

        synchronized(lock) {
          lastArcoreTracking = isTracking
          lastArcorePlane = hasPlane
          if (recording) {
            arcorePos.add(t, tx, ty, tz, stateCode, conf)
            arcoreRot.add(t, qw, qx, qy, qz)
          }
        }
      } catch (e: Exception) {
        // Ignored or camera busy
      }
      try {
        Thread.sleep(16) // ~60 Hz
      } catch (e: InterruptedException) {
        break
      }
    }

    try {
      session.pause()
      session.close()
    } catch (e: Exception) {}

    EGL14.eglMakeCurrent(dpy, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
    EGL14.eglDestroySurface(dpy, eglSurf)
    EGL14.eglDestroyContext(dpy, eglCtx)
    EGL14.eglTerminate(dpy)
  }

  private fun capabilities(): Map<String, Any?> {
    val sm = sensorManager
    val ctx = appContext.reactContext
    val highRate = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ctx?.checkSelfPermission(Manifest.permission.HIGH_SAMPLING_RATE_SENSORS) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      true
    }
    val sensors = SENSOR_TYPES.mapValues { (_, type) ->
      sm.getDefaultSensor(type)?.let { s ->
        mapOf(
          "name" to s.name,
          "vendor" to s.vendor,
          "version" to s.version,
          "maxRange" to s.maximumRange.toDouble(),
          "resolution" to s.resolution.toDouble(),
          "minDelayUs" to s.minDelay,
          "maxDelayUs" to s.maxDelay,
          "fifoMaxEvents" to s.fifoMaxEventCount,
          "powerMa" to s.power.toDouble(),
        )
      }
    }
    return mapOf(
      "sensors" to sensors,
      "highSamplingRateGranted" to highRate,
      "arcoreStatus" to checkArcoreAvailability(),
      "manufacturer" to Build.MANUFACTURER,
      "model" to Build.MODEL,
      "sdkInt" to Build.VERSION.SDK_INT,
      "clockOriginNs" to originNs.toString(),
    )
  }

  private fun startStreaming() {
    synchronized(lock) {
      if (streaming) return
      val sm = sensorManager
      val uncal = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED)
      val magSensor = uncal ?: sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        ?: throw CodedException("ERR_NO_MAGNETOMETER", "This phone has no magnetometer", null)
      magSensorType = magSensor.type
      val t = HandlerThread("magnet-capture").also { it.start() }
      thread = t
      val handler = Handler(t.looper)
      // Delay 0 = fastest the hardware allows; batching off so live feedback stays live.
      sm.registerListener(listener, magSensor, SensorManager.SENSOR_DELAY_FASTEST, 0, handler)
      listOf(Sensor.TYPE_GAME_ROTATION_VECTOR, Sensor.TYPE_ACCELEROMETER, Sensor.TYPE_GYROSCOPE)
        .mapNotNull { sm.getDefaultSensor(it) }
        .forEach { sm.registerListener(listener, it, SensorManager.SENSOR_DELAY_FASTEST, 0, handler) }
      magTimesCount = 0
      streaming = true
    }
  }

  private fun stopStreaming() {
    synchronized(lock) {
      if (!streaming) return
      runCatching { sensorManager.unregisterListener(listener) }
      thread?.quitSafely()
      thread = null
      streaming = false
      recording = false
    }
  }

  private fun handle(e: SensorEvent) {
    val t = e.timestamp - originNs
    val v = e.values
    var emit = false
    synchronized(lock) {
      when (e.sensor.type) {
        Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED, Sensor.TYPE_MAGNETIC_FIELD -> {
          val hasBias = e.sensor.type == Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED && v.size >= 6
          for (i in 0..2) {
            lastMag[i] = v[i].toDouble()
            lastBias[i] = if (hasBias) v[i + 3].toDouble() else 0.0
          }
          if (recording) mag.add(t, lastMag[0], lastMag[1], lastMag[2], lastBias[0], lastBias[1], lastBias[2])
          magTimes[(magTimesCount % RATE_WINDOW).toInt()] = e.timestamp
          magTimesCount++
          if (e.timestamp - lastEmitNs >= EMIT_EVERY_NS) {
            lastEmitNs = e.timestamp
            emit = true
          }
        }
        Sensor.TYPE_GAME_ROTATION_VECTOR -> {
          val q = FloatArray(4)
          SensorManager.getQuaternionFromVector(q, v) // w, x, y, z
          for (i in 0..3) lastQuat[i] = q[i].toDouble()
          if (recording) rot.add(t, lastQuat[0], lastQuat[1], lastQuat[2], lastQuat[3])
        }
        Sensor.TYPE_ACCELEROMETER ->
          if (recording) acc.add(t, v[0].toDouble(), v[1].toDouble(), v[2].toDouble())
        Sensor.TYPE_GYROSCOPE ->
          if (recording) gyr.add(t, v[0].toDouble(), v[1].toDouble(), v[2].toDouble())
      }
    }
    if (emit) emitSample()
  }

  private fun emitSample() {
    val payload: Map<String, Any>
    synchronized(lock) {
      val n = minOf(magTimesCount, RATE_WINDOW.toLong()).toInt()
      val rate = if (n >= 2) {
        val newest = magTimes[((magTimesCount - 1) % RATE_WINDOW).toInt()]
        val oldest = magTimes[((magTimesCount - n) % RATE_WINDOW).toInt()]
        if (newest > oldest) (n - 1) * 1e9 / (newest - oldest) else 0.0
      } else 0.0
      payload = mapOf(
        "mag" to lastMag.toList(),
        "bias" to lastBias.toList(),
        "quat" to lastQuat.toList(),
        "rateHz" to rate,
        "recording" to recording,
        "recordedSamples" to mag.size,
        "arcoreTracking" to lastArcoreTracking,
        "arcorePlane" to lastArcorePlane,
        "tableZ" to (detectedTableZ ?: 0.0),
      )
    }
    sendEvent("onSample", payload)
  }

  /** Growable row buffer with a hard cap so a forgotten recording cannot exhaust memory. */
  private class Rows(private val width: Int) {
    private var data = DoubleArray(width * 4096)
    var size = 0
      private set
    var overflow = false
      private set

    fun add(t: Long, vararg values: Double) {
      if (size >= MAX_ROWS) { overflow = true; return }
      if ((size + 1) * width > data.size) data = data.copyOf(data.size * 2)
      val o = size * width
      data[o] = t.toDouble()
      for (i in values.indices) data[o + 1 + i] = values[i]
      size++
    }

    fun clear() { size = 0; overflow = false }

    fun toArray(): DoubleArray = data.copyOf(size * width)
  }

  companion object {
    private const val EMIT_EVERY_NS = 66_000_000L // ~15 Hz live updates
    private const val RATE_WINDOW = 256
    private const val MAX_ROWS = 600_000 // ~10 min at 1 kHz

    private val SENSOR_TYPES = mapOf(
      "magnetometerUncalibrated" to Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED,
      "magnetometer" to Sensor.TYPE_MAGNETIC_FIELD,
      "gameRotationVector" to Sensor.TYPE_GAME_ROTATION_VECTOR,
      "accelerometer" to Sensor.TYPE_ACCELEROMETER,
      "gyroscope" to Sensor.TYPE_GYROSCOPE,
    )
  }
}
