import React from 'react';
import { motion } from 'framer-motion';
import { SystemTrayButton } from '@/components/SystemTrayButton';
import { SystemTrayStatus } from '@/components/SystemTrayStatus';
import { WindowControls } from '@/components/WindowControls';
import { useSystemTray } from '@/hooks/useSystemTray';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, Settings, Info } from 'lucide-react';

export const SystemTrayPage: React.FC = () => {
  const { state, actions } = useSystemTray();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold text-foreground mb-2">
          System Tray Integration
        </h1>
        <p className="text-muted-foreground">
          Manage DevStackBox visibility and quick actions from the system tray
        </p>
      </motion.div>

      {/* Window Controls Demo */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Window Controls
            </CardTitle>
            <CardDescription>
              Modern window controls with system tray integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h4 className="font-medium">Window Control Buttons</h4>
                <p className="text-sm text-muted-foreground">
                  Use these controls to manage the application window
                </p>
              </div>
              <WindowControls
                onMinimize={() => console.log('Minimize clicked')}
                onMaximize={() => console.log('Maximize clicked')}
                onClose={() => console.log('Close clicked')}
                showSystemTray={true}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* System Tray Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              System Tray Actions
            </CardTitle>
            <CardDescription>
              Quick actions available from the system tray
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Hide to Tray */}
              <div className="flex flex-col items-center space-y-3 p-4 border rounded-lg">
                <SystemTrayButton variant="hide" size="lg" />
                <div className="text-center">
                  <h4 className="font-medium">Hide to Tray</h4>
                  <p className="text-xs text-muted-foreground">
                    Hide window, keep running in tray
                  </p>
                </div>
              </div>

              {/* Minimize */}
              <div className="flex flex-col items-center space-y-3 p-4 border rounded-lg">
                <SystemTrayButton variant="minimize" size="lg" />
                <div className="text-center">
                  <h4 className="font-medium">Minimize</h4>
                  <p className="text-xs text-muted-foreground">
                    Minimize to system tray
                  </p>
                </div>
              </div>

              {/* Quit Application */}
              <div className="flex flex-col items-center space-y-3 p-4 border rounded-lg">
                <SystemTrayButton variant="quit" size="lg" />
                <div className="text-center">
                  <h4 className="font-medium">Quit App</h4>
                  <p className="text-xs text-muted-foreground">
                    Exit DevStackBox completely
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* System Tray Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Current Status
            </CardTitle>
            <CardDescription>
              Real-time status of the application window and tray
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SystemTrayStatus showError={true} />
          </CardContent>
        </Card>
      </motion.div>

      {/* Manual Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Manual System Tray Controls</CardTitle>
            <CardDescription>
              Test system tray functionality with these buttons
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={actions.showMainWindow}
                  variant="outline"
                  size="sm"
                >
                  Show Window
                </Button>
                <Button
                  onClick={actions.hideToTray}
                  variant="outline"
                  size="sm"
                >
                  Hide to Tray
                </Button>
                <Button
                  onClick={actions.quitApp}
                  variant="destructive"
                  size="sm"
                >
                  Quit Application
                </Button>
                {state.error && (
                  <Button
                    onClick={actions.clearError}
                    variant="secondary"
                    size="sm"
                  >
                    Clear Error
                  </Button>
                )}
              </div>

              <hr className="my-4 border-border" />

              <div className="space-y-2">
                <h4 className="font-medium">System Tray Features</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">✓</Badge>
                    <span>Hide to system tray</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">✓</Badge>
                    <span>Right-click context menu</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">✓</Badge>
                    <span>Service quick controls</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">✓</Badge>
                    <span>Click to show/hide</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default SystemTrayPage;
