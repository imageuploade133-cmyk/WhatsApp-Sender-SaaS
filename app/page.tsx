"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  LayoutDashboard,
  QrCode,
  Send,
  Users,
  History,
  Settings,
  LogOut,
  RefreshCw,
  Phone,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Play,
  Pause,
  XCircle,
  Search,
  Check,
  Menu,
  X,
  Upload,
  Info
} from 'lucide-react';

// ==========================================
// Form Validation Schemas
// ==========================================

const singleMessageSchema = z.object({
  phoneNumber: z.string().min(8, { message: 'Phone number must be at least 8 digits' }).regex(/^\+?[\d\s-()]+$/, {
    message: 'Invalid phone number format. Use digits and optional country code.'
  }),
  message: z.string().min(1, { message: 'Message content is required' }),
});

type SingleMessageForm = z.infer<typeof singleMessageSchema>;

// ==========================================
// Interface Definitions
// ==========================================

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  createdAt: string;
}

interface HistoryEntry {
  id: string;
  recipient: string;
  message: string;
  time: string;
  status: 'Sent' | 'Failed';
  error?: string;
}

interface BulkJob {
  id: string;
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  currentNumber: string | null;
  status: 'idle' | 'running' | 'paused' | 'cancelled' | 'completed';
  numbers: string[];
  messageTemplate: string;
  delayMin: number;
  delayMax: number;
}

interface WhatsAppStatus {
  status: 'Disconnected' | 'Generating QR' | 'Waiting for Scan' | 'Connected' | 'Reconnecting' | 'Error';
  phoneNumber: string | null;
  whatsappName: string | null;
  platform: string | null;
  messagesSentToday: number;
  messagesFailed: number;
  connectedSince: string | null;
  qrCodeUrl: string | null;
  error: string | null;
  bulkJob: BulkJob;
}

export default function Dashboard() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'link' | 'send' | 'bulk' | 'contacts' | 'history' | 'settings'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Global State
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus>({
    status: 'Disconnected',
    phoneNumber: null,
    whatsappName: null,
    platform: null,
    messagesSentToday: 0,
    messagesFailed: 0,
    connectedSince: null,
    qrCodeUrl: null,
    error: null,
    bulkJob: {
      id: '',
      total: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
      currentNumber: null,
      status: 'idle',
      numbers: [],
      messageTemplate: '',
      delayMin: 5,
      delayMax: 10,
    },
  });

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Polling intervals reference
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Verification on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.authenticated) {
          router.push('/login');
        } else {
          setCheckingAuth(false);
          // Load Initial Data
          fetchStatus();
          fetchContacts();
          fetchHistory();
        }
      } catch {
        router.push('/login');
      }
    }
    checkAuth();
  }, [router]);

  // Setup periodic polling for connection status & active bulk job progress
  useEffect(() => {
    if (checkingAuth) return;

    pollingRef.current = setInterval(() => {
      fetchStatus();
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [checkingAuth]);

  // ==========================================
  // API Call Helpers
  // ==========================================

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      setWhatsapp(data);
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err);
    }
  };

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.success) {
        setContacts(data.contacts);
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.success) {
        setHistory(data.history);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('success', 'Initiating connection. Please scan the QR code.');
        setActiveTab('link');
      } else {
        showNotification('error', data.error || 'Failed to connect');
      }
    } catch (err: any) {
      showNotification('error', err?.message || 'Server error');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect and clear your WhatsApp session?')) {
      return;
    }
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('success', 'Disconnected successfully.');
        fetchStatus();
      } else {
        showNotification('error', data.error || 'Failed to disconnect');
      }
    } catch (err: any) {
      showNotification('error', err?.message || 'Server error');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      router.push('/login');
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin" />
          <p className="text-gray-500 font-medium">Verifying Administrator Session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50 overflow-hidden">
      {/* SIDEBAR - DESKTOP */}
      <aside className={`fixed inset-y-0 left-0 z-20 flex flex-col w-64 bg-slate-900 border-r border-slate-800 transition-transform duration-300 transform md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:relative'}`}>
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-6 bg-slate-950 border-b border-slate-800">
          <span className="text-lg font-bold text-white flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500 text-slate-950">
              <Send className="h-5 w-5" />
            </span>
            WA SaaS Admin
          </span>
          <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'link', label: 'Link Device', icon: QrCode, badge: whatsapp.status },
            { id: 'send', label: 'Send Message', icon: Send },
            { id: 'bulk', label: 'Bulk Messaging', icon: FileSpreadsheet, badge: whatsapp.bulkJob?.status !== 'idle' ? whatsapp.bulkJob.status : undefined },
            { id: 'contacts', label: 'Upload Contacts', icon: Users, count: contacts.length },
            { id: 'history', label: 'History', icon: History, count: history.length },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  setSidebarOpen(false);
                }}
                className={`flex items-center justify-between w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-150 ${
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.id === 'link' && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                    whatsapp.status === 'Connected' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {whatsapp.status === 'Connected' ? 'Active' : 'Off'}
                  </span>
                )}
                {item.count !== undefined && item.count > 0 && (
                  <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-300 border border-slate-700 shrink-0">
                    {item.count}
                  </span>
                )}
                {item.badge && item.id === 'bulk' && (
                  <span className="text-[10px] uppercase font-bold bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-md shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Area with Sign Out */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3 px-2 py-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white uppercase">
              A
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">Administrator</p>
              <p className="text-xs text-slate-400 truncate">SaaS System Panel</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 rounded-lg transition-all"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* TOP BAR / HEADER */}
        <header className="flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 md:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 capitalize select-none">
              {activeTab.replace('-', ' ')}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick Status Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
              <span className={`h-2.5 w-2.5 rounded-full ${
                whatsapp.status === 'Connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : whatsapp.status === 'Waiting for Scan' || whatsapp.status === 'Generating QR'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500'
              }`} />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {whatsapp.status}
              </span>
            </div>

            <button
              onClick={fetchStatus}
              title="Refresh Global Status"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* NOTIFICATION TOAST */}
        {notification && (
          <div className="absolute top-20 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-in fade-in slide-in-from-top-4 duration-300 bg-white border-slate-200 max-w-sm">
            {notification.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
            )}
            <p className="text-sm font-medium text-gray-800">{notification.message}</p>
          </div>
        )}

        {/* MAIN BODY SCROLL CONTAINER */}
        <main className="flex-1 overflow-y-auto p-6 max-w-7xl w-full mx-auto space-y-6">
          {/* TAB 1: DASHBOARD HOME */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stat Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* 1. Connection Status Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Connection Status</p>
                    <h3 className="mt-2 text-2xl font-bold text-gray-900">{whatsapp.status}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {whatsapp.status === 'Connected' ? 'Linked with account' : 'Scan QR to start sending'}
                    </p>
                  </div>
                  <span className={`p-3 rounded-xl ${
                    whatsapp.status === 'Connected'
                      ? 'bg-emerald-50 text-emerald-600'
                      : whatsapp.status === 'Waiting for Scan' || whatsapp.status === 'Generating QR'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-rose-50 text-rose-600'
                  }`}>
                    <QrCode className="h-6 w-6" />
                  </span>
                </div>

                {/* 2. Messages Sent Today */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Sent Messages</p>
                    <h3 className="mt-2 text-2xl font-bold text-emerald-600">{whatsapp.messagesSentToday}</h3>
                    <p className="mt-1 text-xs text-gray-500">Total success count</p>
                  </div>
                  <span className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                    <CheckCircle className="h-6 w-6" />
                  </span>
                </div>

                {/* 3. Messages Failed */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Failed Messages</p>
                    <h3 className="mt-2 text-2xl font-bold text-rose-600">{whatsapp.messagesFailed}</h3>
                    <p className="mt-1 text-xs text-gray-500">Failed recipient count</p>
                  </div>
                  <span className="p-3 rounded-xl bg-rose-50 text-rose-600">
                    <AlertCircle className="h-6 w-6" />
                  </span>
                </div>

                {/* 4. Connected Since */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Connected Since</p>
                    <h3 className="mt-2 text-md font-bold text-gray-900 truncate max-w-[150px]">
                      {whatsapp.connectedSince ? new Date(whatsapp.connectedSince).toLocaleString() : 'N/A'}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">Latest active date</p>
                  </div>
                  <span className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
                    <History className="h-6 w-6" />
                  </span>
                </div>
              </div>

              {/* Profile Details Card */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Connected Device Information</h2>
                  <span className="text-xs font-semibold text-gray-400 uppercase">Profile Info</span>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">WhatsApp Name</label>
                    <p className="mt-2 text-lg font-bold text-gray-900">{whatsapp.whatsappName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone Number</label>
                    <p className="mt-2 text-lg font-bold text-gray-900">
                      {whatsapp.phoneNumber ? `+${whatsapp.phoneNumber}` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Platform</label>
                    <p className="mt-2 text-lg font-bold text-gray-900">{whatsapp.platform || 'N/A'}</p>
                  </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-4">
                  {whatsapp.status !== 'Connected' && (
                    <button
                      onClick={handleConnect}
                      className="px-6 py-2.5 font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md shadow-emerald-600/10 transition-colors"
                    >
                      Link WhatsApp Device
                    </button>
                  )}
                  {whatsapp.status === 'Connected' && (
                    <button
                      onClick={handleDisconnect}
                      className="px-6 py-2.5 font-semibold text-sm bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md shadow-rose-600/10 transition-colors"
                    >
                      Disconnect WhatsApp Account
                    </button>
                  )}
                  <button
                    onClick={fetchStatus}
                    className="px-6 py-2.5 font-semibold text-sm bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh Status
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LINK DEVICE */}
          {activeTab === 'link' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6 text-center">
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-gray-900">Link Your WhatsApp Device</h2>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Scan the QR code below using your mobile phone&apos;s WhatsApp camera (Settings &gt; Linked Devices &gt; Link Device) to authenticate.
                  </p>
                </div>

                {/* Connection State Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 border border-slate-200">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    whatsapp.status === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'
                  }`} />
                  <span className="text-xs font-semibold text-slate-700 uppercase">
                    Status: {whatsapp.status}
                  </span>
                </div>

                {/* QR Code Container */}
                <div className="flex items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-2xl max-w-xs mx-auto bg-slate-50 relative min-h-[250px]">
                  {whatsapp.status === 'Connected' ? (
                    <div className="space-y-3">
                      <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow">
                        <Check className="h-8 w-8" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">Linked Successfully!</p>
                        <p className="text-xs text-emerald-600 mt-1">Ready to send messages.</p>
                      </div>
                    </div>
                  ) : whatsapp.status === 'Generating QR' ? (
                    <div className="space-y-2">
                      <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin mx-auto" />
                      <p className="text-xs text-gray-500 font-semibold">Generating QR Code...</p>
                    </div>
                  ) : whatsapp.status === 'Waiting for Scan' && whatsapp.qrCodeUrl ? (
                    <img
                      src={whatsapp.qrCodeUrl}
                      alt="WhatsApp QR Code"
                      className="w-full h-full object-contain rounded-lg shadow-sm"
                    />
                  ) : (
                    <div className="space-y-4">
                      <QrCode className="h-10 w-10 text-gray-400 mx-auto" />
                      <div>
                        <p className="text-sm font-semibold text-gray-600">Device is Disconnected</p>
                        <p className="text-xs text-gray-400 mt-1">Initiate connection process to retrieve a fresh QR code.</p>
                      </div>
                      <button
                        onClick={handleConnect}
                        className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                      >
                        Generate QR Code
                      </button>
                    </div>
                  )}
                </div>

                {/* Info block */}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-left flex gap-3 max-w-md mx-auto">
                  <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Please note:</strong> The session uses a persistent browser session in the background. Do not close this browser tab while sending a bulk list. If you experience issues, click <strong>Disconnect</strong> and re-scan.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SEND SINGLE MESSAGE */}
          {activeTab === 'send' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900">Send Single WhatsApp Message</h2>
                  <p className="text-xs text-gray-500">Instantly dispatch a single text message to any phone number globally.</p>
                </div>

                {whatsapp.status !== 'Connected' && (
                  <div className="m-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl flex gap-3">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">WhatsApp Device Not Connected</p>
                      <p className="text-xs mt-1">
                        You must link your WhatsApp account before you can send any messages. Go to the <strong>Link Device</strong> tab.
                      </p>
                    </div>
                  </div>
                )}

                <SendMessageForm status={whatsapp.status} onSendSuccess={() => {
                  showNotification('success', 'Message dispatched successfully!');
                  fetchStatus();
                  fetchHistory();
                }} />
              </div>
            </div>
          )}

          {/* TAB 4: BULK MESSAGING */}
          {activeTab === 'bulk' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Configuration Panel */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Bulk Sender configuration</h2>
                    <p className="text-xs text-gray-500">Configure queue, delay settings and template payload.</p>
                  </div>

                  <BulkSendPanel
                    whatsapp={whatsapp}
                    contacts={contacts}
                    onStartSuccess={() => {
                      showNotification('success', 'Bulk messaging job initiated successfully.');
                      fetchStatus();
                    }}
                    showNotification={showNotification}
                  />
                </div>

                {/* Progress / Monitor Board */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Active Queue Monitor</h2>
                    <p className="text-xs text-gray-500">Real-time stats of current job queue.</p>
                  </div>

                  <BulkMonitor
                    job={whatsapp.bulkJob}
                    whatsappStatus={whatsapp.status}
                    fetchStatus={fetchStatus}
                    showNotification={showNotification}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: UPLOAD CONTACTS */}
          {activeTab === 'contacts' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Import Area */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Import Contacts</h2>
                      <p className="text-xs text-gray-500">Supports CSV, Excel (.xlsx), and manual lines.</p>
                    </div>
                  </div>

                  <ImportContactsForm
                    onImportSuccess={(msg) => {
                      showNotification('success', msg);
                      fetchContacts();
                    }}
                    showNotification={showNotification}
                  />
                </div>

                {/* Contact List Table */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[550px]">
                  <ContactListTable
                    contacts={contacts}
                    fetchContacts={fetchContacts}
                    showNotification={showNotification}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">In-Memory Delivery History</h2>
                  <p className="text-xs text-gray-500">All message dispatches made since the server was started.</p>
                </div>
                <button
                  onClick={fetchHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reload Logs
                </button>
              </div>

              <HistoryTable history={history} />
            </div>
          )}

          {/* TAB 7: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900">System Information &amp; Settings</h2>
                  <p className="text-xs text-gray-500">Details about the current environment configuration.</p>
                </div>

                <div className="p-6 space-y-6">
                  {/* Env summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <p className="text-xs font-semibold text-slate-400 uppercase">Admin Account</p>
                      <p className="text-md font-bold text-slate-800">Configured via environment</p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <p className="text-xs font-semibold text-slate-400 uppercase">Local Storage Directory</p>
                      <p className="text-md font-bold text-slate-800">.auth/ (whatsapp-web.js)</p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <p className="text-xs font-semibold text-slate-400 uppercase">Database Server</p>
                      <p className="text-md font-bold text-rose-500 font-mono">None (100% In-Memory State)</p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <p className="text-xs font-semibold text-slate-400 uppercase">Platform Deployment</p>
                      <p className="text-md font-bold text-emerald-600">Render Single Web Service</p>
                    </div>
                  </div>

                  {/* Guide block */}
                  <div className="p-5 border border-slate-200 bg-slate-50 rounded-xl space-y-3">
                    <h4 className="text-sm font-bold text-gray-800">Developer Deployment Quick Check</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      To successfully deploy this single container inside Render, make sure to add the correct Puppeteer arguments in Node.js (already hardcoded in <code>whatsappService.ts</code>). Your environment variables must include:
                    </p>
                    <ul className="text-xs text-gray-600 font-mono space-y-1.5 list-disc pl-5">
                      <li>ADMIN_EMAIL=your-custom-email</li>
                      <li>ADMIN_PASSWORD=your-secure-password</li>
                      <li>PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome (Optional, Render uses default Chrome)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ==========================================
// Subcomponent: Send Single Message Form
// ==========================================

function SendMessageForm({ status, onSendSuccess }: { status: string; onSendSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<SingleMessageForm>({
    resolver: zodResolver(singleMessageSchema),
    defaultValues: {
      phoneNumber: '',
      message: '',
    },
  });

  const onSubmit = async (data: SingleMessageForm) => {
    if (status !== 'Connected') {
      setError('Cannot dispatch message. Your WhatsApp device is not connected.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: data.phoneNumber,
          message: data.message,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || 'Server rejected message send');
      }

      reset();
      onSendSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl flex gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Recipient Phone Number</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Phone className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            disabled={status !== 'Connected' || loading}
            placeholder="15551234567"
            {...register('phoneNumber')}
            className="block w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 transition-all"
          />
        </div>
        {errors.phoneNumber && (
          <p className="mt-1 text-xs text-rose-500 font-semibold">{errors.phoneNumber.message}</p>
        )}
        <p className="mt-1 text-[10px] text-gray-400">Include country code. Do not include spaces, plus signs, or parenthesis.</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Message Content</label>
        <textarea
          rows={5}
          disabled={status !== 'Connected' || loading}
          placeholder="Type your WhatsApp message text here..."
          {...register('message')}
          className="block w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 transition-all"
        />
        {errors.message && (
          <p className="mt-1 text-xs text-rose-500 font-semibold">{errors.message.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={status !== 'Connected' || loading}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-emerald-600/10"
      >
        <Send className="h-4 w-4" />
        {loading ? 'Sending Message...' : 'Send Message'}
      </button>
    </form>
  );
}

// ==========================================
// Subcomponent: Bulk Messaging Panel
// ==========================================

function BulkSendPanel({
  whatsapp,
  contacts,
  onStartSuccess,
  showNotification
}: {
  whatsapp: WhatsAppStatus;
  contacts: Contact[];
  onStartSuccess: () => void;
  showNotification: (type: 'success' | 'error', message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [manualText, setManualText] = useState('');
  const [message, setMessage] = useState('');
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(10);
  const [useImported, setUseImported] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (whatsapp.status !== 'Connected') {
      showNotification('error', 'Cannot start. Your WhatsApp device is not connected.');
      return;
    }

    if (whatsapp.bulkJob?.status === 'running' || whatsapp.bulkJob?.status === 'paused') {
      showNotification('error', 'A bulk sending job is already active.');
      return;
    }

    let numbers: string[] = [];

    if (useImported) {
      numbers = contacts.map((c) => c.phoneNumber);
    } else {
      // Split by line or comma
      numbers = manualText
        .split(/[\n,]/)
        .map((num) => num.replace(/\D/g, ''))
        .filter(Boolean);
    }

    if (numbers.length === 0) {
      showNotification('error', 'Please provide at least one phone number to send messages to.');
      return;
    }

    if (!message.trim()) {
      showNotification('error', 'Message content is required.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/whatsapp/send-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start',
          numbers,
          message,
          delayMin,
          delayMax,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start bulk job');
      }

      setManualText('');
      setMessage('');
      onStartSuccess();
    } catch (err: any) {
      showNotification('error', err?.message || 'Error triggering bulk sending');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAllContacts = () => {
    setUseImported(true);
    showNotification('success', `Seeded bulk job with ${contacts.length} imported contacts.`);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      {/* Target Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Recipients Source</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setUseImported(false)}
            className={`py-2.5 px-4 text-xs font-bold border rounded-xl transition-all ${
              !useImported
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Manual Numbers Entry
          </button>
          <button
            type="button"
            onClick={handleSelectAllContacts}
            disabled={contacts.length === 0}
            className={`py-2.5 px-4 text-xs font-bold border rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              useImported
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Use Imported ({contacts.length})
          </button>
        </div>
      </div>

      {!useImported ? (
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Manual Numbers (One per line)</label>
          <textarea
            rows={4}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="15551234567&#10;15559876543"
            className="block w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
          />
          <p className="mt-1 text-[10px] text-gray-400">Lines will be automatically cleaned of symbols and scanned for duplicates.</p>
        </div>
      ) : (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800 flex justify-between items-center">
          <p className="font-semibold">Selected {contacts.length} contacts from searchable table list</p>
          <button
            type="button"
            onClick={() => setUseImported(false)}
            className="text-emerald-600 font-bold hover:underline"
          >
            Change
          </button>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Message Template Payload</label>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hi there! This is a bulk broadcast broadcast message."
          className="block w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
        />
      </div>

      {/* Delay Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Min Delay (Seconds)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={delayMin}
            onChange={(e) => setDelayMin(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="block w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Max Delay (Seconds)</label>
          <input
            type="number"
            min={1}
            max={120}
            value={delayMax}
            onChange={(e) => setDelayMax(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="block w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || whatsapp.status !== 'Connected'}
        className="w-full py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-emerald-600/10"
      >
        {loading ? 'Initiating Dispatches...' : 'Start Bulk sending'}
      </button>
    </form>
  );
}

// ==========================================
// Subcomponent: Bulk Messaging Queue Monitor
// ==========================================

function BulkMonitor({
  job,
  whatsappStatus,
  fetchStatus,
  showNotification
}: {
  job: BulkJob;
  whatsappStatus: string;
  fetchStatus: () => void;
  showNotification: (type: 'success' | 'error', message: string) => void;
}) {
  const [controlLoading, setControlLoading] = useState(false);

  const handleAction = async (action: 'pause' | 'resume' | 'cancel') => {
    setControlLoading(true);
    try {
      const res = await fetch('/api/whatsapp/send-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Control action failed');
      }

      showNotification('success', `Queue ${action} request processed!`);
      fetchStatus();
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to control queue');
    } finally {
      setControlLoading(false);
    }
  };

  const percentage = job.total > 0 ? Math.round(((job.sent + job.failed) / job.total) * 100) : 0;

  return (
    <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
      {/* Current Job Info */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase">Queue Status</span>
          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
            job.status === 'running'
              ? 'bg-emerald-500/20 text-emerald-600'
              : job.status === 'paused'
              ? 'bg-amber-500/20 text-amber-600'
              : job.status === 'completed'
              ? 'bg-blue-500/20 text-blue-600'
              : 'bg-slate-100 text-slate-500'
          }`}>
            {job.status}
          </span>
        </div>

        {job.status !== 'idle' ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-gray-400">Current Recipient</p>
              <p className="text-sm font-semibold text-gray-800">{job.currentNumber ? `+${job.currentNumber}` : 'N/A'}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center bg-gray-50 p-3 rounded-xl border border-gray-100">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Sent</p>
                <p className="text-sm font-bold text-emerald-600">{job.sent}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Failed</p>
                <p className="text-sm font-bold text-rose-600">{job.failed}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Left</p>
                <p className="text-sm font-bold text-slate-600">{job.remaining}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-gray-500">
                <span>Progress</span>
                <span>{percentage}%</span>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${percentage}%` }}
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-gray-400 space-y-2">
            <FileSpreadsheet className="h-8 w-8 mx-auto stroke-1" />
            <p className="text-xs">No active bulk dispatch queues in progress.</p>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      {job.status !== 'idle' && (
        <div className="pt-4 border-t border-gray-100 flex gap-2">
          {job.status === 'running' && (
            <button
              type="button"
              disabled={controlLoading}
              onClick={() => handleAction('pause')}
              className="flex-1 py-2.5 px-3 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}

          {job.status === 'paused' && (
            <button
              type="button"
              disabled={controlLoading || whatsappStatus !== 'Connected'}
              onClick={() => handleAction('resume')}
              className="flex-1 py-2.5 px-3 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          )}

          {(job.status === 'running' || job.status === 'paused') && (
            <button
              type="button"
              disabled={controlLoading}
              onClick={() => handleAction('cancel')}
              className="flex-1 py-2.5 px-3 border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Subcomponent: Import Contacts Form
// ==========================================

function ImportContactsForm({
  onImportSuccess,
  showNotification
}: {
  onImportSuccess: (msg: string) => void;
  showNotification: (type: 'success' | 'error', message: string) => void;
}) {
  const [activeImportTab, setActiveImportTab] = useState<'file' | 'manual'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      showNotification('error', 'Please select a file to import.');
      return;
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.csv') && !filename.endsWith('.xlsx') && !filename.endsWith('.xls') && !filename.endsWith('.txt')) {
      showNotification('error', 'Unsupported file extension. Only CSV, TXT, or XLSX allowed.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/contacts/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Server error processing file');
      }

      setFile(null);
      // Reset input element
      const inputEl = document.getElementById('contacts_file_input') as HTMLInputElement;
      if (inputEl) inputEl.value = '';

      onImportSuccess(data.message);
    } catch (err: any) {
      showNotification('error', err?.message || 'Error uploading file');
    } finally {
      setLoading(false);
    }
  };

  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!manualText.trim()) {
      showNotification('error', 'Please input some numbers manually.');
      return;
    }

    setLoading(true);

    // Parse lines. Lines could be "name, phone" or simply "phone"
    const parsedLines = manualText
      .split('\n')
      .map((line) => {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const phoneNumber = parts.slice(1).join(',').replace(/\D/g, '');
          return { name, phoneNumber };
        } else {
          const phoneNumber = line.replace(/\D/g, '');
          return { phoneNumber };
        }
      })
      .filter((c) => c.phoneNumber.length > 0);

    if (parsedLines.length === 0) {
      showNotification('error', 'No valid contact lines detected.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/contacts/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contacts: parsedLines }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit contacts');
      }

      setManualText('');
      onImportSuccess(data.message);
    } catch (err: any) {
      showNotification('error', err?.message || 'Error processing manual contacts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Selector */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveImportTab('file')}
          className={`flex-1 pb-2.5 text-xs font-bold border-b-2 text-center transition-colors ${
            activeImportTab === 'file'
              ? 'border-emerald-500 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          CSV / Excel File
        </button>
        <button
          onClick={() => setActiveImportTab('manual')}
          className={`flex-1 pb-2.5 text-xs font-bold border-b-2 text-center transition-colors ${
            activeImportTab === 'manual'
              ? 'border-emerald-500 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Manual Textarea
        </button>
      </div>

      {activeImportTab === 'file' ? (
        <form onSubmit={handleFileUpload} className="space-y-4">
          <div className="border-2 border-dashed border-gray-200 hover:border-emerald-400 rounded-2xl p-6 bg-slate-50 transition-colors relative cursor-pointer flex flex-col items-center text-center">
            <Upload className="h-8 w-8 text-gray-400 mb-2" />
            <span className="text-xs font-bold text-gray-700">
              {file ? file.name : 'Select Contact File'}
            </span>
            <span className="text-[10px] text-gray-400 mt-1">
              Supports .csv, .xlsx, or .txt
            </span>
            <input
              id="contacts_file_input"
              type="file"
              disabled={loading}
              onChange={handleFileChange}
              accept=".csv,.xlsx,.xls,.txt"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !file}
            className="w-full py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-xl transition-colors shadow"
          >
            {loading ? 'Processing Upload...' : 'Import Selected File'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleManualImport} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Paste Raw Contacts</label>
            <textarea
              rows={5}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="John Doe, 15551234567&#10;Alice Smith, 15558887777&#10;15559998888"
              className="block w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
            />
            <p className="mt-1 text-[9px] text-gray-400">Format: Name, Phone (or Phone only, one per line).</p>
          </div>

          <button
            type="submit"
            disabled={loading || !manualText.trim()}
            className="w-full py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed rounded-xl transition-colors shadow"
          >
            {loading ? 'Importing contacts...' : 'Import Manual Text'}
          </button>
        </form>
      )}
    </div>
  );
}

// ==========================================
// Subcomponent: Contact List Table
// ==========================================

function ContactListTable({
  contacts,
  fetchContacts,
  showNotification
}: {
  contacts: Contact[];
  fetchContacts: () => void;
  showNotification: (type: 'success' | 'error', message: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [clearLoading, setClearLoading] = useState(false);

  const handleClear = async () => {
    if (contacts.length === 0) return;
    if (!confirm('Are you sure you want to delete ALL contacts? This cannot be undone.')) {
      return;
    }

    setClearLoading(true);
    try {
      const res = await fetch('/api/contacts/clear', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('success', 'Contact database cleared successfully.');
        fetchContacts();
      } else {
        throw new Error(data.error || 'Failed to clear contacts');
      }
    } catch (err: any) {
      showNotification('error', err?.message || 'Error occurred');
    } finally {
      setClearLoading(false);
    }
  };

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phoneNumber.includes(search)
  );

  return (
    <>
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Imported Contact Database</h2>
          <p className="text-[10px] text-gray-400">Total: {contacts.length} unique phone records</p>
        </div>

        <div className="flex gap-2">
          {contacts.length > 0 && (
            <button
              onClick={handleClear}
              disabled={clearLoading}
              className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
            >
              Clear DB
            </button>
          )}
          <button
            onClick={fetchContacts}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 bg-white"
          >
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Search inputs */}
      <div className="px-6 py-3 border-b border-gray-100">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records by name or phone number..."
            className="block w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase select-none sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3">Contact Name</th>
                <th className="px-6 py-3">Phone Number</th>
                <th className="px-6 py-3">Added Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3.5 font-semibold text-gray-900">{item.name}</td>
                  <td className="px-6 py-3.5 font-mono">+{item.phoneNumber}</td>
                  <td className="px-6 py-3.5 text-gray-400">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-20 text-center text-gray-400 space-y-2">
            <Users className="h-10 w-10 mx-auto stroke-1" />
            <p className="text-xs font-semibold">No contacts match the active filter criteria.</p>
          </div>
        )}
      </div>
    </>
  );
}

// ==========================================
// Subcomponent: History Table
// ==========================================

function HistoryTable({ history }: { history: HistoryEntry[] }) {
  const [filterSearch, setFilterSearch] = useState('');

  const filtered = history.filter(
    (item) =>
      item.recipient.includes(filterSearch) ||
      item.message.toLowerCase().includes(filterSearch.toLowerCase()) ||
      item.status.toLowerCase().includes(filterSearch.toLowerCase())
  );

  return (
    <>
      <div className="px-6 py-3 border-b border-gray-100">
        <div className="relative max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search logs by phone, content, status..."
            className="block w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        {filtered.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase select-none sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3">Recipient</th>
                <th className="px-6 py-3">Message Content</th>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors align-top">
                  <td className="px-6 py-4 font-mono font-semibold text-gray-950 whitespace-nowrap">
                    +{item.recipient}
                  </td>
                  <td className="px-6 py-4 max-w-md break-words font-medium">
                    {item.message}
                    {item.error && (
                      <p className="text-[10px] text-rose-500 mt-1 font-semibold">
                        Err: {item.error}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-400 whitespace-nowrap">
                    {new Date(item.time).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                      item.status === 'Sent'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${item.status === 'Sent' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-24 text-center text-gray-400 space-y-2 flex-1 flex flex-col justify-center">
            <History className="h-10 w-10 mx-auto stroke-1" />
            <p className="text-xs font-semibold">No message logs exist in delivery history.</p>
          </div>
        )}
      </div>
    </>
  );
}
