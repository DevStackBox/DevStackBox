import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Minimize2, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface SystemTrayButtonProps {
  variant?: 'minimize' | 'hide' | 'quit';
  size?: 'sm' | 'lg';
  className?: string;
}

export const SystemTrayButton: React.FC<SystemTrayButtonProps> = ({
  variant = 'minimize',
  size = 'sm',
  className = '',
}) => {
  const handleTrayAction = async () => {
    try {
      switch (variant) {
        case 'minimize':
        case 'hide':
          await invoke('hide_to_tray');
          break;
        case 'quit':
          await invoke('quit_app');
          break;
        default:
          console.warn('Unknown tray action:', variant);
      }
    } catch (error) {
      console.error(`Failed to ${variant}:`, error);
    }
  };

  const getIcon = () => {
    switch (variant) {
      case 'minimize':
        return <Minimize2 className="h-4 w-4" />;
      case 'hide':
        return <EyeOff className="h-4 w-4" />;
      case 'quit':
        return <X className="h-4 w-4" />;
      default:
        return <Minimize2 className="h-4 w-4" />;
    }
  };

  const getTooltip = () => {
    switch (variant) {
      case 'minimize':
        return 'Minimize to System Tray';
      case 'hide':
        return 'Hide to System Tray';
      case 'quit':
        return 'Quit Application';
      default:
        return 'Minimize to Tray';
    }
  };

  const getVariantStyle = () => {
    switch (variant) {
      case 'quit':
        return 'destructive';
      default:
        return 'ghost';
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <Button
        variant={getVariantStyle() as any}
        size={size}
        onClick={handleTrayAction}
        className={`${className}`}
        aria-label={getTooltip()}
        title={getTooltip()}
      >
        {getIcon()}
      </Button>
    </motion.div>
  );
};

export default SystemTrayButton;
