import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { apiClient } from '@/api/apiClient.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function AdminUsers() {
  const { role, token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canManage = role === 'admin';
  const headers = useMemo(() => {
    const bearer = token || import.meta?.env?.VITE_API_TOKEN || '';
    return bearer ? { Authorization: `Bearer ${bearer}` } : {};
  }, [token]);

  async function loadUsers() {
    setError('');
    setLoading(true);
    try {
      const list = await apiClient.request('GET', '/admin/users', { headers });
      setUsers(list || []);
    } catch (e) {
      setError(e?.message || 'Falha ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canManage) loadUsers();
  }, [canManage]);

  const onCreate = async (e) => {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const full_name = String(form.get('full_name') || '').trim() || undefined;
    const role = String(form.get('role') || 'operator');
    if (!email || !password) {
      setError('Preencha e-mail e senha (mín. 8 caracteres)');
      return;
    }
    setLoading(true);
    try {
      await apiClient.request('POST', '/admin/users', {
        body: { email, password, full_name, role },
        headers,
      });
      e.currentTarget.reset();
      await loadUsers();
    } catch (e) {
      setError(e?.message || 'Falha ao criar usuário');
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (userId) => {
    if (!confirm('Remover usuário? Esta ação é irreversível.')) return;
    setLoading(true);
    setError('');
    try {
      await apiClient.request('DELETE', '/admin/users', {
        body: { user_id: userId },
        headers,
      });
      await loadUsers();
    } catch (e) {
      setError(e?.message || 'Falha ao remover usuário');
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <div className="p-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Gerenciar Usuários</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            <Input name="full_name" placeholder="Nome completo" />
            <Input type="email" name="email" placeholder="E-mail" required />
            <Input type="password" name="password" placeholder="Senha (mín. 8)" required />
            <select name="role" className="border rounded px-3 py-2">
              <option value="operator">operator</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
            <div className="md:col-span-4">
              <Button type="submit" disabled={loading}>Criar Usuário</Button>
            </div>
          </form>

          {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}

          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.user_id} className="flex items-center justify-between border rounded p-3">
                <div className="text-sm">
                  <div className="font-medium">{u.full_name || 'Sem nome'}</div>
                  <div className="text-gray-600">{u.user_id}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded bg-gray-100">{u.role}</span>
                  <Button variant="destructive" onClick={() => onDelete(u.user_id)} disabled={loading}>Remover</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
