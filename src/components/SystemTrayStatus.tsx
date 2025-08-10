import React from 'react';
import { Monitor, Minimize2, EyeOff, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { useSystemTray } from '@/hooks/useSystemTray';

interface SystemTrayStatusProps {
  className?: string;
  showError?: boolean;
}

export const SystemTrayStatus: React.FC<SystemTrayStatusProps> = ({
  className = '',
  showError = true,
}) => {
  const { state, actions } = useSystemTray();

  const getStatusIcon = () => {
    if (state.isHidden) {
      return <EyeOff className="h-4 w-4" />;
    }
    if (state.isMinimized) {
      return <Minimize2 className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (state.isHidden) return 'Hidden in System Tray';
    if (state.isMinimized) return 'Minimized to Tray';
    return 'Window Visible';
  };

  const getStatusVariant = () => {
    if (state.isHidden || state.isMinimized) return 'secondary';
    return 'default';
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Badge variant={getStatusVariant()} className="flex items-center gap-2">
          {getStatusIcon()}
          <span>{getStatusText()}</span>
        </Badge>
      </motion.div>

      <AnimatePresence>
        {state.error && showError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2 p-3 text-sm bg-destructive/10 text-destructive border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              <div className="flex items-center justify-between flex-1">
                <span>{state.error}</span>
                <button
                  onClick={actions.clearError}
                  className="ml-2 text-xs underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {state.lastAction && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-xs text-muted-foreground"
        >
          Last action: {state.lastAction}
        </motion.div>
      )}
    </div>
  );
};

export default SystemTrayStatus;
