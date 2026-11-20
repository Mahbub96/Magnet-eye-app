# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.

# React Native Reanimated & TurboModules
-keep class com.swmansion.reanimated.** { *; }
-keepclassmembers class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.jni.** { *; }

# Expo Modules Core Architecture & JNI (critical for dynamic dispatch)
-keep class expo.modules.** { *; }
-keep interface expo.modules.** { *; }
-keepclassmembers class expo.modules.** { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class * extends expo.modules.core.interfaces.LifecycleEventListener { *; }

# Expo GL & WebGL JNI Reflection (CRITICAL for Three.js / 3D Viewer)
-keep class expo.modules.gl.** { *; }
-keep interface expo.modules.gl.** { *; }
-keepclassmembers class expo.modules.gl.** { *; }
-keep class * implements expo.modules.gl.GLContextDelegate { *; }
-keep class * implements expo.modules.gl.GLView { *; }

# React Native Gesture Handler
-keep class com.swmansion.gesturehandler.** { *; }
-keepclassmembers class com.swmansion.gesturehandler.** { *; }
-keep class * extends com.swmansion.gesturehandler.core.GestureHandler { *; }

# React Native Screens
-keep class com.swmansion.rnscreens.** { *; }
-keepclassmembers class com.swmansion.rnscreens.** { *; }

# React Native SVG
-keep class com.horcrux.svg.** { *; }
-keepclassmembers class com.horcrux.svg.** { *; }

# Expo SQLite & FileSystem
-keep class expo.modules.sqlite.** { *; }
-keepclassmembers class expo.modules.sqlite.** { *; }
-keep class expo.modules.filesystem.** { *; }
-keepclassmembers class expo.modules.filesystem.** { *; }

# OpenGL ES & EGL
-keep class javax.microedition.khronos.** { *; }
-keepclassmembers class javax.microedition.khronos.** { *; }
-keep class android.opengl.** { *; }
-keepclassmembers class android.opengl.** { *; }

# Keep all native JNI methods
-keepclasseswithmembernames class * {
    native <methods>;
}
