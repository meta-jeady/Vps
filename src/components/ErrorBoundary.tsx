import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Une erreur inattendue est survenue.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let readable = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          readable = `Erreur Firestore (${parsed.operationType} sur ${parsed.path || 'base'}) : ${parsed.error}`;
        }
      } catch {
        // Not a JSON FirestoreErrorInfo string
      }

      return (
        <div className="min-h-screen bg-[#0B0D12] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-[#13161F] border border-red-500/30 p-6 space-y-4 text-center shadow-2xl">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-lg font-bold text-white">Interruption détectée</h2>
            <p className="text-xs text-slate-300 leading-relaxed break-words bg-[#0B0D12] p-3 rounded-xl border border-slate-800 font-mono">
              {readable}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw size={16} />
              <span>Recharger l’interface</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
