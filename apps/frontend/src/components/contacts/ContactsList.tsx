'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Search, X, UserCheck, Mail, Phone, Building2, AtSign, Trash2 } from 'lucide-react';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email?: string;
  phone?: string;
  isVerified: boolean;
  createdAt: string;
  company: { id: string; name: string };
}

interface Company {
  id: string;
  name: string;
}

interface AddContactForm {
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  companyId: string;
}

const BLANK: AddContactForm = {
  firstName: '', lastName: '', role: '', email: '', phone: '', companyId: '',
};

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function ContactsList() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<AddContactForm>(BLANK);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search],
    queryFn: () =>
      api.get<{ data: Contact[] }>(`/contacts?search=${search}&limit=100`).then((r) => r.data.data),
  });

  const { data: companies } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () =>
      api.get<{ data: Company[] }>('/prospects?limit=100').then((r) => r.data.data),
  });

  const generateEmail = useMutation({
    mutationFn: (companyId: string) => api.post(`/prospects/${companyId}/email`),
    onSuccess: () => toast.success('Email generated — check Approvals'),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to generate email');
    },
  });

  const deleteContact = useMutation({
    mutationFn: (id: string) => api.delete(`/contacts/${id}`),
    onSuccess: () => {
      toast.success('Contact removed');
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: () => toast.error('Failed to delete contact'),
  });

  const addContact = useMutation({
    mutationFn: (d: AddContactForm) =>
      api.post('/contacts', {
        firstName: d.firstName,
        lastName: d.lastName,
        role: d.role,
        email: d.email || undefined,
        phone: d.phone || undefined,
        companyId: d.companyId,
      }),
    onSuccess: () => {
      toast.success('Contact added');
      setShowModal(false);
      setForm(BLANK);
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to add contact');
    },
  });

  const filtered = data ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </button>
      </div>

      {/* Count */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">{filtered.length} contact{filtered.length !== 1 ? 's' : ''}</p>
      )}

      {/* List */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="h-11 w-11 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-40" />
                  <div className="h-3 bg-muted rounded w-28" />
                </div>
                <div className="hidden md:flex gap-6">
                  <div className="h-3 bg-muted rounded w-32" />
                  <div className="h-3 bg-muted rounded w-28" />
                  <div className="h-3 bg-muted rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-muted-foreground text-sm">
            {search ? 'No contacts match your search.' : 'No contacts yet — add one or use Find Contacts on the Companies page.'}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((c) => {
              const initials = `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase();
              const color = avatarColor(c.firstName + c.lastName);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                >
                  {/* Avatar */}
                  <div className={`h-10 w-10 rounded-full ${color} text-white flex items-center justify-center text-sm font-bold shrink-0`}>
                    {initials}
                  </div>

                  {/* Name + role */}
                  <div className="w-44 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm leading-tight">{c.firstName} {c.lastName}</span>
                      {c.isVerified && <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{c.role}</span>
                  </div>

                  {/* Company */}
                  <div className="hidden lg:flex items-center gap-1.5 w-48 shrink-0">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate text-muted-foreground">{c.company.name}</span>
                  </div>

                  {/* Email */}
                  <div className="hidden md:flex items-center gap-1.5 flex-1 min-w-0">
                    <AtSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate text-muted-foreground">{c.email ?? '—'}</span>
                  </div>

                  {/* Phone */}
                  <div className="hidden md:flex items-center gap-1.5 w-40 shrink-0">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">{c.phone ?? '—'}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <button
                      onClick={() => generateEmail.mutate(c.company.id)}
                      disabled={generateEmail.isPending}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-50 disabled:opacity-50 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Mail</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${c.firstName} ${c.lastName}?`)) deleteContact.mutate(c.id);
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="bg-primary px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary-foreground">Add Contact</h2>
                <p className="text-xs text-primary-foreground/70 mt-0.5">Add a decision maker for email outreach</p>
              </div>
              <button
                onClick={() => { setShowModal(false); setForm(BLANK); }}
                className="rounded-full p-1.5 hover:bg-white/20 text-primary-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); addContact.mutate(form); }}
              className="p-6 space-y-5"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">
                  Company <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.companyId}
                  onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a company...</option>
                  {companies?.map((co) => (
                    <option key={co.id} value={co.id}>{co.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(['firstName', 'lastName'] as const).map((key, i) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">
                      {i === 0 ? 'First Name' : 'Last Name'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder={i === 0 ? 'John' : 'Smith'}
                      value={form[key]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">
                  Job Title / Role <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="Operations Manager"
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="john@company.com"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Phone</label>
                  <input
                    type="text"
                    placeholder="+1 555 000 0000"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(BLANK); }}
                  className="h-10 px-5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addContact.isPending}
                  className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {addContact.isPending ? 'Adding…' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
