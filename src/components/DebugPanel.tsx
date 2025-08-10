import React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DebugInfo {
  [key: string]: string;
}

export function DebugPanel() {
  const [debugInfo, setDebugInfo] = React.useState<DebugInfo>({});
  const [loading, setLoading] = React.useState(false);

  const runDebug = async () => {
    setLoading(true);
    try {
      const info = await invoke<DebugInfo>('debug_installation');
      setDebugInfo(info);
    } catch (error) {
      console.error('Debug failed:', error);
      setDebugInfo({ error: String(error) });
    }
    setLoading(false);
  };

  const stopAllServices = async () => {
    try {
      const result = await invoke<string>('stop_all_services');
      alert('Stop Services Result: ' + result);
    } catch (error) {
      alert('Failed to stop services: ' + error);
    }
  };

  const testApacheConfig = async () => {
    try {
      const result = await invoke<string>('test_apache_config');
      alert('Apache Config Test Result: ' + result);
    } catch (error) {
      alert('Apache Config Test Failed: ' + error);
    }
  };

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h3 className="text-lg font-bold mb-4">Debug Installation</h3>
      
      <div className="space-x-2 mb-4">
        <button 
          onClick={runDebug} 
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Debug Info'}
        </button>
        
        <button 
          onClick={stopAllServices}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Stop All Services
        </button>
        
        <button 
          onClick={testApacheConfig}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Test Apache Config
        </button>
      </div>

      {Object.keys(debugInfo).length > 0 && (
        <div className="bg-white p-4 rounded border">
          <h4 className="font-semibold mb-2">Debug Information:</h4>
          <div className="space-y-1 text-sm font-mono">
            {Object.entries(debugInfo).map(([key, value]) => (
              <div key={key}>
                <strong>{key}:</strong> {value}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
