import { describe, expect, it, jest } from '@jest/globals';

import { ErrorBoundary } from '../ui/ErrorBoundary';

describe('ErrorBoundary unit tests', () => {
  it('correctly derives state from an error', () => {
    const error = new Error('Simulated WebGL 3D Crash');
    const state = ErrorBoundary.getDerivedStateFromError(error);
    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
  });

  it('renders children when no error occurs', () => {
    const boundary = new ErrorBoundary({ children: 'Hello Normal Content' });
    const rendered = boundary.render();
    expect(rendered).toBe('Hello Normal Content');
  });

  it('renders fallback when error is present', () => {
    const boundary = new ErrorBoundary({
      children: 'Hello Normal Content',
      fallback: 'Custom 2D Fallback',
    });
    boundary.state = {
      hasError: true,
      error: new Error('EGL Context Failure'),
      errorInfo: null,
      showDetails: false,
    };
    const rendered = boundary.render();
    expect(rendered).toBe('Custom 2D Fallback');
  });

  it('renders dynamic fallback function with error details', () => {
    const fallbackFn = jest.fn((err: Error) => `Fallback: ${err.message}`);
    const boundary = new ErrorBoundary({
      children: 'Hello Normal Content',
      fallback: fallbackFn,
    });
    boundary.state = {
      hasError: true,
      error: new Error('ThreeJS Shader Compilation Error'),
      errorInfo: null,
      showDetails: false,
    };
    const rendered = boundary.render();
    expect(rendered).toBe('Fallback: ThreeJS Shader Compilation Error');
    expect(fallbackFn).toHaveBeenCalled();
  });
});
