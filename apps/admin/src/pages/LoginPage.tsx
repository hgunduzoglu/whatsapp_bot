import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../lib/api';
import type { LoginResponse } from '../lib/types';
import { Button, ErrorText, Field, TextInput } from '../components/ui';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setToken(result.accessToken);
      navigate('/');
    } catch {
      setError('E-posta veya şifre hatalı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
        <h1 className="mb-6 text-center text-lg font-semibold text-slate-800">Yönetim Paneli</h1>
        <div className="space-y-4">
          <Field label="E-posta">
            <TextInput
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Şifre">
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </Button>
          <ErrorText message={error} />
        </div>
      </form>
    </div>
  );
}
