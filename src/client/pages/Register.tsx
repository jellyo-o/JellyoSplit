import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useSettings } from '../context/SettingsContext';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isFirstUser, setIsFirstUser] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { appName } = useSettings();

  useEffect(() => {
    async function checkStatus() {
      try {
        const { hasAdmin } = await fetchApi('/auth/system-status');
        setIsFirstUser(!hasAdmin);
      } catch (err) {
        console.error('Failed to fetch system status', err);
      }
    }
    checkStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: email, // Use email as username for local auth
          displayName: name,
          email,
          password
        }),
      });
      await login({ username: email, password });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
  };

  const handleOIDCLogin = () => {
    window.location.href = '/api/auth/oidc';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary-600 dark:text-primary-400">
            {isFirstUser ? 'Create Admin Account' : 'Create an Account'}
          </CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {isFirstUser
              ? 'Welcome! You are the first user. Set up your admin account to get started.'
              : `Join ${appName} to manage your shared expenses.`}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 p-2 rounded-md">{error}</div>}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full">
              {isFirstUser ? 'Create Admin' : 'Sign Up'}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" type="button" onClick={handleOIDCLogin} className="w-full">
            Single Sign-On (OIDC)
          </Button>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-500">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
