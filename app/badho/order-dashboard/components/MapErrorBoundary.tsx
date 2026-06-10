'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback (e.g. the section name). */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Contains render errors thrown by the map subtree (e.g. react-simple-maps
 * choking on an unprojectable coordinate) so a single bad data point can't
 * blank the whole dashboard with Next's global "Application error" screen.
 */
export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface it for debugging without taking the page down.
    console.error('Map render error (contained):', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-[640px] flex items-center justify-center text-purple-300">
          <div className="flex flex-col items-center gap-2 text-center px-6">
            <span className="text-3xl">🗺️</span>
            <div className="text-sm font-semibold text-white">
              {this.props.label ?? 'Map'} couldn’t render
            </div>
            <div className="text-xs text-purple-300/70 max-w-sm">
              A data point could not be plotted. The rest of the dashboard is unaffected — try
              toggling the view or changing filters.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
