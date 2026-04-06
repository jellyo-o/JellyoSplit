import { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Server, Shield } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';

interface Settings {
  registrationEnabled: string;
  defaultCurrency: string;
  appName: string;
  oidcDisplayName: string;
  authMode: string;
  oidcAutoProvision: string;
}

interface OidcProvider {
  id: string;
  name: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  autoProvision: boolean;
  source: 'database' | 'env';
}

interface OidcProviderFormData {
  name: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  autoProvision: boolean;
}

const emptyForm: OidcProviderFormData = {
  name: '',
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
  enabled: true,
  autoProvision: true,
};

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // OIDC providers
  const [providers, setProviders] = useState<OidcProvider[]>([]);
  const [envProvider, setEnvProvider] = useState<OidcProvider | null>(null);
  const [oidcAutoProvision, setOidcAutoProvision] = useState(true);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerModal, setProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<OidcProvider | null>(null);
  const [providerForm, setProviderForm] = useState<OidcProviderFormData>({ ...emptyForm });
  const [providerError, setProviderError] = useState('');
  const [savingProvider, setSavingProvider] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadProviders();
  }, []);

  async function loadSettings() {
    try {
      const data = await fetchApi('/settings');
      setSettings(data.settings);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function loadProviders() {
    try {
      const data = await fetchApi('/oidc-providers');
      setProviders(data.providers);
      setEnvProvider(data.envProvider);
      setOidcAutoProvision(data.oidcAutoProvision);
    } catch (err: any) {
      console.error('Failed to load OIDC providers:', err);
    } finally {
      setLoadingProviders(false);
    }
  }

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await fetchApi('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(data.settings);
      setSuccess('Settings saved successfully.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof Settings, value: string) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const openAddProvider = () => {
    setEditingProvider(null);
    setProviderForm({ ...emptyForm });
    setProviderError('');
    setProviderModal(true);
  };

  const openEditProvider = (p: OidcProvider) => {
    setEditingProvider(p);
    setProviderForm({
      name: p.name,
      issuerUrl: p.issuerUrl,
      clientId: p.clientId,
      clientSecret: p.clientSecret,
      enabled: p.enabled,
      autoProvision: p.autoProvision,
    });
    setProviderError('');
    setProviderModal(true);
  };

  const handleSaveProvider = async () => {
    setSavingProvider(true);
    setProviderError('');
    try {
      if (editingProvider) {
        await fetchApi(`/oidc-providers/${editingProvider.id}`, {
          method: 'PUT',
          body: JSON.stringify(providerForm),
        });
      } else {
        await fetchApi('/oidc-providers', {
          method: 'POST',
          body: JSON.stringify(providerForm),
        });
      }
      setProviderModal(false);
      await loadProviders();
    } catch (err: any) {
      setProviderError(err.message || 'Failed to save provider');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      await fetchApi(`/oidc-providers/${id}`, { method: 'DELETE' });
      await loadProviders();
      setConfirmDeleteId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete provider');
    }
  };

  const handleToggleAutoProvision = async () => {
    const newValue = !oidcAutoProvision;
    try {
      await fetchApi('/oidc-providers/settings/auto-provision', {
        method: 'PUT',
        body: JSON.stringify({ enabled: newValue }),
      });
      setOidcAutoProvision(newValue);
    } catch (err: any) {
      setError(err.message || 'Failed to update auto-provision setting');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">{error || 'Failed to load settings'}</div>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-4 rounded-lg">{success}</div>}

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Application Name</label>
            <Input
              value={settings.appName}
              onChange={(e) => updateSetting('appName', e.target.value)}
              placeholder="GatherSplit"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">Displayed in the header and login pages.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Default Currency</label>
            <Input
              value={settings.defaultCurrency}
              onChange={(e) => updateSetting('defaultCurrency', e.target.value)}
              placeholder="SGD"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">Default currency for new gatherings (ISO 4217 code).</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Authentication Mode</label>
            <select
              value={settings.authMode}
              onChange={(e) => updateSetting('authMode', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="local">Local only</option>
              <option value="oidc">OIDC only</option>
              <option value="both">Local + OIDC</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400">Controls which login methods are available.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email/Password Registration</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={settings.registrationEnabled === 'true'}
                onClick={() => updateSetting('registrationEnabled', settings.registrationEnabled === 'true' ? 'false' : 'true')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                  settings.registrationEnabled === 'true' ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.registrationEnabled === 'true' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {settings.registrationEnabled === 'true' ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">When disabled, only admins can create new local accounts. OIDC users can still be auto-provisioned if enabled below.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">OIDC Button Label (env provider)</label>
            <Input
              value={settings.oidcDisplayName}
              onChange={(e) => updateSetting('oidcDisplayName', e.target.value)}
              placeholder="Sign in with SSO"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">Text shown on the SSO login button for the environment variable provider.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* OIDC Providers Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>OIDC Providers</CardTitle>
            <Button size="sm" onClick={openAddProvider}>
              <Plus className="w-4 h-4 mr-1" />
              Add Provider
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure OpenID Connect identity providers for single sign-on. Users can sign in through any enabled provider.
          </p>

          {/* Global auto-provision toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-provision new OIDC users (global)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Automatically create accounts for new users signing in via OIDC. Per-provider settings override this default.</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={oidcAutoProvision}
              onClick={handleToggleAutoProvision}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                oidcAutoProvision ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  oidcAutoProvision ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Env var provider (read-only) */}
          {envProvider && (
            <div className="border border-amber-200 dark:border-amber-700 rounded-xl p-4 bg-amber-50/50 dark:bg-amber-900/10">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Environment Variable Provider</span>
                <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded uppercase tracking-wider">Read-only</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Issuer URL</span>
                  <p className="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">{envProvider.issuerUrl}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Client ID</span>
                  <p className="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">{envProvider.clientId}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Client Secret</span>
                  <p className="text-gray-700 dark:text-gray-300 font-mono text-xs">{envProvider.clientSecret}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
                  <p className={envProvider.enabled ? 'text-green-600 dark:text-green-400 text-xs font-medium' : 'text-gray-400 text-xs'}>
                    {envProvider.enabled ? 'Active (AUTH_MODE includes OIDC)' : 'Inactive (AUTH_MODE = local)'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                Configured via OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET environment variables. Edit the .env file or deployment config to change.
              </p>
            </div>
          )}

          {/* Database providers */}
          {loadingProviders ? (
            <p className="text-sm text-gray-400">Loading providers...</p>
          ) : providers.length === 0 && !envProvider ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <p className="mb-2">No OIDC providers configured.</p>
              <p className="text-xs">Add a provider to enable single sign-on, or configure via environment variables.</p>
            </div>
          ) : (
            providers.map((p) => (
              <div
                key={p.id}
                className={`border rounded-xl p-4 transition-colors ${
                  p.enabled
                    ? 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                    : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{p.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      p.enabled
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {p.autoProvision && (
                      <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Auto-provision
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditProvider(p)} className="h-8 px-2">
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(p.id)} className="h-8 px-2 text-red-500 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {confirmDeleteId === p.id && (
                  <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                      Delete this provider? Users who signed in through it will no longer be able to authenticate via this provider.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleDeleteProvider(p.id)}
                        className="text-xs h-7 bg-red-600 hover:bg-red-700 text-white"
                      >
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)} className="text-xs h-7">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Issuer URL</span>
                    <p className="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">{p.issuerUrl}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Client ID</span>
                    <p className="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">{p.clientId}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Callback URL</span>
                    <p className="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">
                      {window.location.origin}/api/auth/oidc/{p.id}/callback
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Provider Modal */}
      <Modal
        isOpen={providerModal}
        onClose={() => setProviderModal(false)}
        title={editingProvider ? 'Edit OIDC Provider' : 'Add OIDC Provider'}
        className="max-w-lg"
      >
        <div className="space-y-4">
          {providerError && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">{providerError}</div>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Display Name</label>
            <Input
              value={providerForm.name}
              onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
              placeholder="e.g., Google, Okta, Authentik"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">Shown on the login button.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Issuer URL</label>
            <Input
              value={providerForm.issuerUrl}
              onChange={(e) => setProviderForm({ ...providerForm, issuerUrl: e.target.value })}
              placeholder="https://accounts.google.com"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">The OpenID Connect discovery URL. Must support .well-known/openid-configuration.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Client ID</label>
            <Input
              value={providerForm.clientId}
              onChange={(e) => setProviderForm({ ...providerForm, clientId: e.target.value })}
              placeholder="your-client-id"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Client Secret</label>
            <div className="relative">
              <Input
                type={showSecrets['modal'] ? 'text' : 'password'}
                value={providerForm.clientSecret}
                onChange={(e) => setProviderForm({ ...providerForm, clientSecret: e.target.value })}
                placeholder={editingProvider ? 'Leave as-is or enter new secret' : 'your-client-secret'}
              />
              <button
                type="button"
                onClick={() => setShowSecrets((s) => ({ ...s, modal: !s.modal }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                {showSecrets['modal'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {editingProvider && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <span className="text-xs text-gray-500 dark:text-gray-400">Callback URL (configure in your IdP)</span>
              <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all mt-1">
                {window.location.origin}/api/auth/oidc/{editingProvider.id}/callback
              </p>
            </div>
          )}

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={providerForm.enabled}
                onChange={(e) => setProviderForm({ ...providerForm, enabled: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={providerForm.autoProvision}
                onChange={(e) => setProviderForm({ ...providerForm, autoProvision: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Auto-provision new users</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setProviderModal(false)}>Cancel</Button>
            <Button onClick={handleSaveProvider} disabled={savingProvider}>
              {savingProvider ? 'Saving...' : editingProvider ? 'Update Provider' : 'Add Provider'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
