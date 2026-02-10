/**
 * Main App Component
 * Handles authentication routing
 */

import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { syncManager } from './services/syncManager';
import { apiClient } from './services/apiClient';

// Components
import { LoginPage } from './components/LoginPage';
import { AuthenticatedApp } from './components/AuthenticatedApp';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verify authentication on mount (clears expired tokens)
  useEffect(() => {
    const checkAuth = () => {
      const isValid = apiClient.isAuthenticated();
      if (isValid) {
        const user = apiClient.getCurrentUser();
        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // Handle login
  const handleLogin = async (email: string, password: string) => {
    const { user } = await apiClient.login(email, password);
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  // Handle logout
  const handleLogout = () => {
    apiClient.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    syncManager.destroy();
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-right" />
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  // Show authenticated app
  return <AuthenticatedApp currentUser={currentUser} onLogout={handleLogout} />;
}

export default App;
