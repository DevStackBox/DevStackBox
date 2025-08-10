import React from 'react';
import { Minimize2, Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { SystemTrayButton } from './SystemTrayButton';

interface WindowControlsProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  showSystemTray?: boolean;
  className?: string;
}

export const WindowControls: React.FC<WindowControlsProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  showSystemTray = true,
  className = '',
}) => {
  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    }
  };

  const handleMaximize = () => {
    if (onMaximize) {
      onMaximize();
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Regular minimize button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMinimize}
          className="h-8 w-8 p-0 hover:bg-muted"
          aria-label="Minimize Window"
          title="Minimize Window"
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
      </motion.div>

      {/* Maximize button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMaximize}
          className="h-8 w-8 p-0 hover:bg-muted"
          aria-label="Maximize Window"
          title="Maximize Window"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </motion.div>

      {/* System Tray minimize button */}
      {showSystemTray && (
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          title="Hide to System Tray"
        >
          <SystemTrayButton
            variant="hide"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-blue-500/10 hover:text-blue-500"
          />
        </motion.div>
      )}

      {/* Close button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
          aria-label="Close Window"
          title="Close Window"
        >
          <X className="h-4 w-4" />
        </Button>
      </motion.div>
    </div>
  );
};

export default WindowControls;
