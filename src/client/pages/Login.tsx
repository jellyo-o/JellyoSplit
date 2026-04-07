import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useSettings } from '../context/SettingsContext';
import { fetchApi } from '../lib/api';
import { safeRedirectTarget } from '../lib/safeRedirect';

interface OidcProviderInfo {
  id: string;
  name: string;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { appName } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  // The path to redirect to after a successful login. Comes from
  // ProtectedRoute via location.state.from when an unauthenticated user
  // tried to access a protected URL (e.g. /gathering/join/<shareCode>).
  // Validated to prevent open-redirect.
  const fromState = (location.state as { from?: string } | null)?.from;
  const redirectAfterLogin = safeRedirectTarget(fromState) ?? '/';

  const [authMode, setAuthMode] = useState<string>('both');
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [oidcProviders, setOidcProviders] = useState<OidcProviderInfo[]>([]);
  const [oidcDisplayName, setOidcDisplayName] = useState('Single Sign-On (OIDC)');

  useEffect(() => {
    // Load public settings
    fetchApi('/settings/public')
      .then((data) => {
        setAuthMode(data.settings.authMode || 'both');
        setRegistrationEnabled(data.settings.registrationEnabled !== 'false');
        setOidcDisplayName(data.settings.oidcDisplayName || 'Single Sign-On (OIDC)');
      })
      .catch(() => {});

    // Load available OIDC providers
    fetchApi('/oidc-providers/available')
      .then((data) => {
        setOidcProviders(data.providers || []);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ username: email, password });
      navigate(redirectAfterLogin, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const handleOIDCLogin = (providerId: string) => {
    // Pass the post-login destination to the server via ?next=. The server
    // re-validates and stores it in the session before kicking off the OIDC
    // flow, then redirects there on successful callback.
    const next = redirectAfterLogin && redirectAfterLogin !== '/'
      ? `?next=${encodeURIComponent(redirectAfterLogin)}`
      : '';
    if (providerId === 'env') {
      window.location.href = `/api/auth/oidc${next}`;
    } else {
      window.location.href = `/api/auth/oidc/${providerId}${next}`;
    }
  };

  const showLocal = authMode === 'local' || authMode === 'both';
  const showOidc = authMode === 'oidc' || authMode === 'both';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary-600 dark:text-primary-400">{appName}</CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Welcome back! Please login to your account.</p>
        </CardHeader>
        <CardContent>
          {showLocal && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 p-2 rounded-md">{error}</div>}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your-username"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Sign In
              </Button>
            </form>
          )}

          {showLocal && showOidc && oidcProviders.length > 0 && (
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">Or continue with</span>
              </div>
            </div>
          )}

          {showOidc && oidcProviders.length > 0 && (
            <div className="space-y-2">
              {oidcProviders.map((provider) => (
                <Button
                  key={provider.id}
                  variant="outline"
                  type="button"
                  onClick={() => handleOIDCLogin(provider.id)}
                  className="w-full"
                >
                  {provider.id === 'env' ? oidcDisplayName : `Sign in with ${provider.name}`}
                </Button>
              ))}
            </div>
          )}

          {showOidc && oidcProviders.length === 0 && !showLocal && (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              <p className="text-sm">No login methods are currently available.</p>
              <p className="text-xs mt-1">Please contact your administrator.</p>
            </div>
          )}

          {showLocal && registrationEnabled && (
            <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <Link
                to="/register"
                state={fromState ? { from: fromState } : undefined}
                className="font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-500"
              >
                Sign up
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
