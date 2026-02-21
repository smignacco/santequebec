import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export function LoginOrg() {
  const [form, setForm] = useState({ orgCode: '', pin: '', name: '', email: '' });
  const nav = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data = await api('/auth/org-login', { method: 'POST', body: JSON.stringify(form) });
    localStorage.setItem('token', data.token);
    nav('/org');
  };
  return <form onSubmit={submit}><h1>Connexion organisation</h1>{Object.keys(form).map((k) => <input key={k} placeholder={k} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />)}<button>Se connecter</button></form>;
}
