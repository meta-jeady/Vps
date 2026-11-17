import React, { useEffect, useMemo, useState } from 'react';
import { User, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  Check,
  Copy,
  Database,
  Edit3,
  Globe,
  Key,
  Lock,
  LogIn,
  LogOut,
  PauseCircle,
  PlayCircle,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Send,
  Server,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  addDaysIso,
  buildVlessWithHost,
  DEFAULT_HOST_PLACEHOLDER,
  DEFAULT_VLESS_TEMPLATE,
  formatBytes,
  isValidAppId,
} from '../utils/vless';

export interface VpnClientRecord {
  clientId: string;
  clientName: string;
  host: string;
  vlessConfig: string;
  quotaGb: number;
  quotaBytes: number;
  consumedBytes: number;
  expireDate: string;
  status: 'active' | 'suspended';
  locked: boolean;
  usageKey: string;
  configRevision: number;
  ownerUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

interface VpsAdminPanelProps {
  user: User | null;
  authReady: boolean;
  simulatorAppId: string;
  onShowToast: (msg: string) => void;
  onJumpToClientSimulator: () => void;
}

const ADMIN_EMAIL = 'djiogofoyet@gmail.com';

export const VpsAdminPanel: React.FC<VpsAdminPanelProps> = ({
  user,
  authReady,
  simulatorAppId,
  onShowToast,
  onJumpToClientSimulator,
}) => {
  const [isAdminVerified, setIsAdminVerified] = useState<boolean>(false);
  const [checkingAdmin, setCheckingAdmin] = useState<boolean>(true);
  const [signingIn, setSigningIn] = useState<boolean>(false);

  // Global VPS VLESS & Host settings
  const [vlessTemplate, setVlessTemplate] = useState<string>(DEFAULT_VLESS_TEMPLATE);
  const [defaultHost, setDefaultHost] = useState<string>(DEFAULT_HOST_PLACEHOLDER);
  const [defaultExpiryDays, setDefaultExpiryDays] = useState<number>(30);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Client provisioning form state
  const [clientIdInput, setClientIdInput] = useState<string>('');
  const [clientNameInput, setClientNameInput] = useState<string>('');
  const [quotaGbInput, setQuotaGbInput] = useState<string>('5');
  const [clientHostInput, setClientHostInput] = useState<string>(DEFAULT_HOST_PLACEHOLDER);
  const [hostTouchedManually, setHostTouchedManually] = useState<boolean>(false);
  const [expireDaysInput, setExpireDaysInput] = useState<number>(30);
  const [lockConfigInput, setLockConfigInput] = useState<boolean>(true);
  const [submittingClient, setSubmittingClient] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  // Live clients list
  const [clients, setClients] = useState<VpnClientRecord[]>([]);
  const [loadingClients, setLoadingClients] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Edit modal state
  const [editingClient, setEditingClient] = useState<VpnClientRecord | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editQuotaGb, setEditQuotaGb] = useState<string>('5');
  const [editHost, setEditHost] = useState<string>('');
  const [editExpireDate, setEditExpireDate] = useState<string>('');
  const [editLocked, setEditLocked] = useState<boolean>(true);
  const [editResetUsage, setEditResetUsage] = useState<boolean>(false);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Verify admin privileges once auth state resolves
  useEffect(() => {
    let active = true;
    const verifyRole = async () => {
      if (!authReady) return;
      if (!user) {
        if (active) {
          setIsAdminVerified(false);
          setCheckingAdmin(false);
        }
        return;
      }

      setCheckingAdmin(true);
      if (user.emailVerified && user.email === ADMIN_EMAIL) {
        if (active) {
          setIsAdminVerified(true);
          setCheckingAdmin(false);
        }
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        if (active) {
          setIsAdminVerified(user.emailVerified && adminDoc.exists());
          setCheckingAdmin(false);
        }
      } catch {
        if (active) {
          setIsAdminVerified(false);
          setCheckingAdmin(false);
        }
      }
    };

    verifyRole();
    return () => {
      active = false;
    };
  }, [user, authReady]);

  // Listen to VPS Settings & Clients list in real time when admin is authenticated
  useEffect(() => {
    if (!authReady || !user || !isAdminVerified) {
      setClients([]);
      return;
    }

    setLoadingClients(true);

    const settingsRef = doc(db, 'vps_settings', 'default');
    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (typeof d.vlessTemplate === 'string' && d.vlessTemplate.trim()) {
            setVlessTemplate(d.vlessTemplate);
          }
          if (typeof d.defaultHost === 'string' && d.defaultHost.trim()) {
            setDefaultHost(d.defaultHost);
            if (!hostTouchedManually) {
              setClientHostInput(d.defaultHost);
            }
          }
          if (typeof d.defaultExpiryDays === 'number' && d.defaultExpiryDays > 0) {
            setDefaultExpiryDays(d.defaultExpiryDays);
          }
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'vps_settings/default');
      }
    );

    const clientsQuery = query(collection(db, 'vpn_clients'), orderBy('updatedAt', 'desc'));
    const unsubClients = onSnapshot(
      clientsQuery,
      (snapshot) => {
        const list: VpnClientRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            clientId: String(data.clientId || d.id),
            clientName: String(data.clientName || ''),
            host: String(data.host || ''),
            vlessConfig: String(data.vlessConfig || ''),
            quotaGb: Number(data.quotaGb || 0),
            quotaBytes: Number(data.quotaBytes || 0),
            consumedBytes: Number(data.consumedBytes || 0),
            expireDate: String(data.expireDate || ''),
            status: data.status === 'suspended' ? 'suspended' : 'active',
            locked: Boolean(data.locked),
            usageKey: String(data.usageKey || ''),
            configRevision: Number(data.configRevision || 1),
            ownerUid: String(data.ownerUid || ''),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        setClients(list);
        setLoadingClients(false);
      },
      (err) => {
        setLoadingClients(false);
        handleFirestoreError(err, OperationType.LIST, 'vpn_clients');
      }
    );

    return () => {
      unsubSettings();
      unsubClients();
    };
  }, [authReady, user, isAdminVerified, hostTouchedManually]);

  const compiledPreviewVless = useMemo(
    () => buildVlessWithHost(vlessTemplate, defaultHost),
    [vlessTemplate, defaultHost]
  );

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onShowToast('Connexion administrateur réussie.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Échec de connexion Google.';
      onShowToast(`Connexion annulée ou refusée : ${msg}`);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSaveVpsSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedHost = defaultHost.trim();
    const trimmedTemplate = vlessTemplate.trim();

    if (!trimmedHost || trimmedHost.length > 255) {
      onShowToast('Veuillez saisir un Host valide (1 à 255 caractères).');
      return;
    }
    if (!trimmedTemplate.startsWith('vless://') || trimmedTemplate.length < 15) {
      onShowToast('Le lien moteur doit commencer par vless://.');
      return;
    }

    setSavingSettings(true);
    const path = 'vps_settings/default';
    try {
      await setDoc(doc(db, 'vps_settings', 'default'), {
        vlessTemplate: trimmedTemplate,
        defaultHost: trimmedHost,
        defaultExpiryDays: Math.max(1, Math.min(3650, Math.round(defaultExpiryDays || 30))),
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
      if (!hostTouchedManually) {
        setClientHostInput(trimmedHost);
      }
      onShowToast(`Paramètres VPS enregistrés (Host : ${trimmedHost}).`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateOrPushClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError('');

    const cleanId = clientIdInput.trim().toUpperCase();
    const cleanName = clientNameInput.trim();
    const cleanHost = (clientHostInput || defaultHost).trim();
    const quotaNum = parseFloat(quotaGbInput.replace(',', '.'));

    if (!isValidAppId(cleanId)) {
      setFormError("L'ID de l'App doit respecter le format OR-XXXX-XXXX (ou XV-XXXX-XXXX).");
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 80) {
      setFormError('Le nom du client doit contenir entre 2 et 80 caractères.');
      return;
    }
    if (isNaN(quotaNum) || quotaNum <= 0 || quotaNum > 100000) {
      setFormError('Veuillez saisir un nombre de Giga valide (> 0).');
      return;
    }
    if (!cleanHost || cleanHost.length > 255) {
      setFormError('Veuillez définir un Host pour le tunnel VLESS.');
      return;
    }

    const compiledVless = buildVlessWithHost(vlessTemplate, cleanHost);
    const quotaBytes = Math.round(quotaNum * 1024 * 1024 * 1024);
    const expireDate = addDaysIso(expireDaysInput || defaultExpiryDays);

    setSubmittingClient(true);
    const docPath = `vpn_clients/${cleanId}`;
    try {
      const existingSnap = await getDoc(doc(db, 'vpn_clients', cleanId));

      if (existingSnap.exists()) {
        const prev = existingSnap.data();
        const nextRev = Number(prev.configRevision || 1) + 1;
        await updateDoc(doc(db, 'vpn_clients', cleanId), {
          clientName: cleanName,
          host: cleanHost,
          vlessConfig: compiledVless,
          quotaGb: quotaNum,
          quotaBytes,
          consumedBytes: Number(prev.consumedBytes || 0),
          expireDate,
          status: 'active',
          locked: lockConfigInput,
          usageKey: String(prev.usageKey || `uk_${cleanId}_${Date.now()}`),
          configRevision: nextRev,
          updatedAt: serverTimestamp(),
        });
        onShowToast(`Client ${cleanName} (${cleanId}) mis à jour en temps réel (rev #${nextRev}).`);
      } else {
        await setDoc(doc(db, 'vpn_clients', cleanId), {
          clientId: cleanId,
          clientName: cleanName,
          host: cleanHost,
          vlessConfig: compiledVless,
          quotaGb: quotaNum,
          quotaBytes,
          consumedBytes: 0,
          expireDate,
          status: 'active',
          locked: lockConfigInput,
          usageKey: `uk_${cleanId.replace(/[^A-Z0-9]/g, '')}_${Date.now().toString(36)}`,
          configRevision: 1,
          ownerUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        onShowToast(`Configuration envoyée en temps réel à ${cleanName} (${cleanId} • ${quotaNum} Go).`);
      }

      setClientIdInput('');
      setClientNameInput('');
      setHostTouchedManually(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, docPath);
    } finally {
      setSubmittingClient(false);
    }
  };

  const handleToggleClientStatus = async (client: VpnClientRecord) => {
    const nextStatus = client.status === 'active' ? 'suspended' : 'active';
    const docPath = `vpn_clients/${client.clientId}`;
    try {
      await updateDoc(doc(db, 'vpn_clients', client.clientId), {
        status: nextStatus,
        configRevision: client.configRevision + 1,
        updatedAt: serverTimestamp(),
      });
      onShowToast(
        nextStatus === 'active'
          ? `Accès réactivé pour ${client.clientName} (${client.clientId}).`
          : `Client ${client.clientName} (${client.clientId}) suspendu en temps réel.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    }
  };

  const handleQuickAdd5Gb = async (client: VpnClientRecord) => {
    const nextGb = Number((client.quotaGb + 5).toFixed(2));
    const nextBytes = Math.round(nextGb * 1024 * 1024 * 1024);
    const docPath = `vpn_clients/${client.clientId}`;
    try {
      await updateDoc(doc(db, 'vpn_clients', client.clientId), {
        clientName: client.clientName,
        host: client.host,
        vlessConfig: client.vlessConfig,
        quotaGb: nextGb,
        quotaBytes: nextBytes,
        consumedBytes: client.consumedBytes,
        expireDate: client.expireDate,
        status: 'active',
        locked: client.locked,
        usageKey: client.usageKey,
        configRevision: client.configRevision + 1,
        updatedAt: serverTimestamp(),
      });
      onShowToast(`+5 Go ajoutés à ${client.clientName} (Total : ${nextGb} Go).`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    }
  };

  const openEditModal = (client: VpnClientRecord) => {
    setEditingClient(client);
    setEditName(client.clientName);
    setEditQuotaGb(String(client.quotaGb));
    setEditHost(client.host);
    setEditExpireDate(client.expireDate);
    setEditLocked(client.locked);
    setEditResetUsage(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    const cleanName = editName.trim();
    const cleanHost = editHost.trim();
    const quotaNum = parseFloat(editQuotaGb.replace(',', '.'));

    if (cleanName.length < 2 || isNaN(quotaNum) || quotaNum <= 0 || !cleanHost || !editExpireDate) {
      onShowToast('Veuillez vérifier les champs de modification.');
      return;
    }

    setSavingEdit(true);
    const docPath = `vpn_clients/${editingClient.clientId}`;
    try {
      const nextUsageKey = editResetUsage
        ? `uk_${editingClient.clientId.replace(/[^A-Z0-9]/g, '')}_${Date.now().toString(36)}`
        : editingClient.usageKey;
      const compiledVless = buildVlessWithHost(vlessTemplate, cleanHost);

      await updateDoc(doc(db, 'vpn_clients', editingClient.clientId), {
        clientName: cleanName,
        host: cleanHost,
        vlessConfig: compiledVless,
        quotaGb: quotaNum,
        quotaBytes: Math.round(quotaNum * 1024 * 1024 * 1024),
        consumedBytes: editResetUsage ? 0 : editingClient.consumedBytes,
        expireDate: editExpireDate,
        status: editingClient.status,
        locked: editLocked,
        usageKey: nextUsageKey,
        configRevision: editingClient.configRevision + 1,
        updatedAt: serverTimestamp(),
      });
      onShowToast(`Profil ${cleanName} mis à jour et poussé vers l'APK.`);
      setEditingClient(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    const docPath = `vpn_clients/${clientId}`;
    try {
      await deleteDoc(doc(db, 'vpn_clients', clientId));
      setConfirmDeleteId(null);
      onShowToast(`Client ${clientId} révoqué et supprimé du Panel.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  };

  const copyText = (key: string, value: string, label: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800);
    onShowToast(`${label} copié.`);
  };

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clients.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.clientId.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        c.host.toLowerCase().includes(q)
      );
    });
  }, [clients, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const activeCount = clients.filter((c) => c.status === 'active').length;
    const suspendedCount = clients.filter((c) => c.status === 'suspended').length;
    const totalGb = clients.reduce((sum, c) => sum + (c.quotaGb || 0), 0);
    return {
      total: clients.length,
      activeCount,
      suspendedCount,
      totalGb: Number(totalGb.toFixed(1)),
    };
  }, [clients]);

  // Auth Gate
  if (!authReady || checkingAdmin) {
    return (
      <div className="max-w-md mx-auto rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
        <RefreshCw size={28} className="mx-auto text-orange-500 animate-spin" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Vérification de la session administrateur VPS...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto rounded-3xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 p-7 shadow-sm space-y-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500/15 border border-orange-500/30 text-orange-500 flex items-center justify-center">
          <Server size={26} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Panel Admin VPS • Orange VPN
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
            Connectez-vous avec votre compte administrateur pour gérer vos clients, définir les quotas en Go, injecter votre Host VLESS et pousser les configurations vers les APK en temps réel.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 p-4 text-left space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap size={14} className="text-orange-500" />
            Fonctionnement VPS Temps Réel :
          </div>
          <p>1. L’utilisateur vous envoie son ID App (<code className="font-mono text-orange-500">OR-XXXX-XXXX</code>).</p>
          <p>2. Vous ajoutez son ID, son nom et son forfait en Go dans ce Panel.</p>
          <p>3. La configuration VLESS apparaît automatiquement dans son APK Android.</p>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="w-full min-h-[46px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <LogIn size={17} />
            <span>{signingIn ? 'Connexion en cours...' : 'Se connecter au Panel Admin'}</span>
          </button>
          <button
            onClick={onJumpToClientSimulator}
            className="w-full min-h-[42px] rounded-xl bg-slate-100 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Smartphone size={15} className="text-orange-500" />
            <span>Ouvrir l’Aperçu App Client (sans connexion admin)</span>
          </button>
        </div>
      </div>
    );
  }

  if (!isAdminVerified) {
    return (
      <div className="max-w-lg mx-auto rounded-3xl bg-white dark:bg-[#13161F] border border-red-500/30 p-7 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/15 text-red-500 flex items-center justify-center">
          <Lock size={22} />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Accès réservé à l’administrateur
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Le compte <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{user.email}</span> n’est pas autorisé à administrer le serveur VPS Orange VPN. Connectez-vous avec <span className="font-mono text-orange-500">{ADMIN_EMAIL}</span>.
        </p>
        <div className="flex flex-wrap gap-2.5 justify-center pt-1">
          <button
            onClick={async () => {
              await signOut(auth);
              handleGoogleSignIn();
            }}
            className="min-h-[42px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center gap-2"
          >
            <LogIn size={15} />
            <span>Changer de compte</span>
          </button>
          <button
            onClick={onJumpToClientSimulator}
            className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-[#1A1E29] text-slate-700 dark:text-slate-200 text-xs font-semibold"
          >
            Voir l’App Client
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* VPS KPI Row & Admin Session Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Clients totaux</span>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {stats.total}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
            <Users size={19} />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Tunnels actifs</span>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
              {stats.activeCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <ShieldCheck size={19} />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Suspendus</span>
            <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
              {stats.suspendedCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <PauseCircle size={19} />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Volume alloué</span>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {stats.totalGb} <span className="text-sm font-bold text-orange-500">Go</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
            <Database size={19} />
          </div>
        </div>
      </div>

      {/* Main 12-Col Grid: Left (VLESS/Host + Add Client), Right (Live Clients Table) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Provision New Client */}
          <form
            onSubmit={handleCreateOrPushClient}
            className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-orange-500" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Ajouter un client (Temps réel)
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Saisissez l’ID App envoyé par l’utilisateur, son nom et ses Go
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut(auth)}
                title={`Déconnecter ${user.email}`}
                className="min-h-[34px] px-2.5 rounded-lg bg-slate-100 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] text-slate-600 dark:text-slate-300 text-[11px] font-semibold flex items-center gap-1.5"
              >
                <LogOut size={13} />
                <span>Admin</span>
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 font-medium">
                {formError}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  ID de l’App utilisateur
                </label>
                <button
                  type="button"
                  onClick={() => setClientIdInput(simulatorAppId)}
                  className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                >
                  Utiliser ID du Simulateur ({simulatorAppId})
                </button>
              </div>
              <input
                type="text"
                required
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value.toUpperCase())}
                placeholder="Ex: OR-7K9P-3M2X"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm font-mono font-bold text-orange-600 dark:text-orange-400 placeholder:text-slate-400 placeholder:font-normal focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nom du client
                </label>
                <input
                  type="text"
                  required
                  value={clientNameInput}
                  onChange={(e) => setClientNameInput(e.target.value)}
                  placeholder="Ex: Jean-Paul"
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Forfait (Giga / Go)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    required
                    value={quotaGbInput}
                    onChange={(e) => setQuotaGbInput(e.target.value)}
                    className="w-full min-h-[42px] pl-3.5 pr-11 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm font-mono font-bold text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-orange-500">
                    Go
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {['2', '5', '10', '25', '50', '100'].map((gb) => (
                <button
                  key={gb}
                  type="button"
                  onClick={() => setQuotaGbInput(gb)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors ${
                    quotaGbInput === gb
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-100 dark:bg-[#0E1118] text-slate-600 dark:text-slate-300 hover:bg-orange-500/10 hover:text-orange-500'
                  }`}
                >
                  {gb} Go
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Host injecté (`host=...`)
                </label>
                <input
                  type="text"
                  required
                  value={clientHostInput}
                  onChange={(e) => {
                    setHostTouchedManually(true);
                    setClientHostInput(e.target.value);
                  }}
                  placeholder="Ex: m.orange.cm"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Validité (jours)
                </label>
                <select
                  value={expireDaysInput}
                  onChange={(e) => setExpireDaysInput(Number(e.target.value))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                >
                  <option value={3}>3 jours</option>
                  <option value={7}>7 jours (1 semaine)</option>
                  <option value={15}>15 jours</option>
                  <option value={30}>30 jours (1 mois)</option>
                  <option value={60}>60 jours (2 mois)</option>
                  <option value={90}>90 jours (3 mois)</option>
                </select>
              </div>
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                  Verrouiller le Host dans l’APK
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Masque le Host & lien VLESS tout en exécutant le moteur Xray
                </span>
              </div>
              <input
                type="checkbox"
                checked={lockConfigInput}
                onChange={(e) => setLockConfigInput(e.target.checked)}
                className="w-4 h-4 accent-orange-500"
              />
            </label>

            <button
              type="submit"
              disabled={submittingClient}
              className="w-full min-h-[46px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Send size={16} />
              <span>
                {submittingClient ? 'Synchronisation...' : 'Ajouter & Envoyer en temps réel'}
              </span>
            </button>
          </form>

          {/* Card 2: VLESS Engine & Host Settings */}
          <form
            onSubmit={handleSaveVpsSettings}
            className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <Globe size={18} className="text-orange-500" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Moteur VLESS & Création du Host
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Injecte automatiquement votre Host dans le lien VLESS du VPN
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                Xray VLESS WS+TLS
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Host par défaut (`host=...`)
              </label>
              <input
                type="text"
                value={defaultHost}
                onChange={(e) => setDefaultHost(e.target.value)}
                placeholder="Ex: m.orange.cm"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm font-mono font-bold text-orange-600 dark:text-orange-400 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Modèle VLESS du serveur
              </label>
              <textarea
                rows={3}
                value={vlessTemplate}
                onChange={(e) => setVlessTemplate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 focus:border-orange-500 focus:outline-none resize-none"
              />
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Aperçu VLESS généré avec Host :
                </span>
                <button
                  type="button"
                  onClick={() => copyText('preview-vless', compiledPreviewVless, 'Lien VLESS')}
                  className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1"
                >
                  {copiedKey === 'preview-vless' ? <Check size={12} /> : <Copy size={12} />}
                  <span>Copier</span>
                </button>
              </div>
              <p className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 break-all leading-relaxed">
                {compiledPreviewVless}
              </p>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full min-h-[42px] rounded-xl bg-slate-900 dark:bg-[#1E2432] hover:bg-slate-800 dark:hover:bg-[#262E40] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Save size={15} />
              <span>{savingSettings ? 'Sauvegarde...' : 'Enregistrer le Host & VLESS sur le VPS'}</span>
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Live Clients Console */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <Radio size={18} className="text-emerald-500" />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Clients connectés au Panel VPS
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Synchronisation temps réel avec les APK Android & Simulateurs
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onJumpToClientSimulator}
                className="min-h-[36px] px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Smartphone size={14} />
                <span>Tester côté Client</span>
              </button>
            </div>

            {/* Search & Filter */}
            <div className="flex flex-wrap gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par ID (OR-...) ou nom..."
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800">
                {[
                  { id: 'all', label: 'Tous' },
                  { id: 'active', label: 'Actifs' },
                  { id: 'suspended', label: 'Suspendus' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id as 'all' | 'active' | 'suspended')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      statusFilter === f.id
                        ? 'bg-white dark:bg-[#1E2432] text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clients List */}
            {loadingClients ? (
              <div className="py-12 text-center space-y-2">
                <RefreshCw size={24} className="mx-auto text-orange-500 animate-spin" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Chargement des clients VPS...
                </p>
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="py-12 text-center space-y-2 rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-dashed border-slate-200 dark:border-slate-800 p-6">
                <Shield size={28} className="mx-auto text-slate-400" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Aucun client provisionné pour le moment
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Ajoutez un identifiant <code className="font-mono text-orange-500">OR-XXXX-XXXX</code> à gauche avec un nom et un volume en Go pour pousser la configuration VLESS en temps réel.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredClients.map((client) => {
                  const pct =
                    client.quotaBytes > 0
                      ? Math.min(100, Math.round((client.consumedBytes / client.quotaBytes) * 100))
                      : 0;
                  const isSuspended = client.status === 'suspended';

                  return (
                    <div
                      key={client.clientId}
                      className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                        isSuspended
                          ? 'bg-amber-500/5 border-amber-500/30'
                          : 'bg-slate-50/80 dark:bg-[#0E1118] border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/25">
                              {client.clientId}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyText(`id-${client.clientId}`, client.clientId, 'ID App')}
                              className="text-slate-400 hover:text-orange-500 transition-colors"
                              title="Copier l'ID"
                            >
                              {copiedKey === `id-${client.clientId}` ? (
                                <Check size={14} className="text-emerald-500" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {client.clientName}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                                isSuspended
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {isSuspended ? 'Suspendu' : 'Actif'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            <span>Host: <strong className="text-slate-700 dark:text-slate-200">{client.host}</strong></span>
                            <span>Expire: <strong className="text-slate-700 dark:text-slate-200">{client.expireDate}</strong></span>
                            <span>Rev #{client.configRevision}</span>
                            {client.locked && (
                              <span className="inline-flex items-center gap-1 text-orange-500">
                                <Lock size={11} /> Verrouillé APK
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right tabular-nums">
                          <div className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                            {client.quotaGb} Go
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatBytes(client.consumedBytes)} utilisés
                          </div>
                        </div>
                      </div>

                      {/* Quota bar */}
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isSuspended ? 'bg-amber-500' : 'bg-gradient-to-r from-orange-500 to-emerald-500'
                          }`}
                          style={{ width: `${Math.max(3, pct)}%` }}
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuickAdd5Gb(client)}
                            className="min-h-[32px] px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Plus size={12} />
                            <span>+5 Go</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(client)}
                            className="min-h-[32px] px-2.5 rounded-lg bg-slate-200/70 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] text-slate-700 dark:text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Edit3 size={12} />
                            <span>Modifier</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleClientStatus(client)}
                            className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                              isSuspended
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {isSuspended ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                            <span>{isSuspended ? 'Réactiver' : 'Suspendre'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(`vless-${client.clientId}`, client.vlessConfig, 'Lien VLESS')
                            }
                            className="min-h-[32px] px-2.5 rounded-lg bg-slate-200/70 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] text-slate-700 dark:text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            {copiedKey === `vless-${client.clientId}` ? (
                              <Check size={12} className="text-emerald-500" />
                            ) : (
                              <Key size={12} className="text-orange-500" />
                            )}
                            <span>VLESS</span>
                          </button>
                        </div>

                        {confirmDeleteId === client.clientId ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteClient(client.clientId)}
                              className="min-h-[32px] px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[32px] px-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(client.clientId)}
                            className="min-h-[32px] px-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Trash2 size={12} />
                            <span>Supprimer</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* APK Real-Time Sync Info Strip */}
          <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Server size={17} />
              </div>
              <div>
                <div className="font-bold text-slate-900 dark:text-white">
                  Liaison active avec le vrai APK Android (Flutter V2Ray)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Le moteur Xray de <code className="font-mono">lib/main.dart</code> reste intact : l’APK interroge ce Panel toutes les 8s avec son <code className="font-mono text-orange-500">OR-XXXX-XXXX</code>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Modifier client {editingClient.clientId}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Les modifications s’appliquent en temps réel sur l’APK
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nom du client
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quota (Go)
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    required
                    value={editQuotaGb}
                    onChange={(e) => setEditQuotaGb(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm font-mono font-bold text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Date d’expiration
                  </label>
                  <input
                    type="date"
                    required
                    value={editExpireDate}
                    onChange={(e) => setEditExpireDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Host (`host=...`)
                </label>
                <input
                  type="text"
                  required
                  value={editHost}
                  onChange={(e) => setEditHost(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 cursor-pointer">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Verrouiller Host/VLESS dans l’APK
                </span>
                <input
                  type="checkbox"
                  checked={editLocked}
                  onChange={(e) => setEditLocked(e.target.checked)}
                  className="w-4 h-4 accent-orange-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 cursor-pointer">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Remettre à zéro le compteur client (nouveau forfait)
                </span>
                <input
                  type="checkbox"
                  checked={editResetUsage}
                  onChange={(e) => setEditResetUsage(e.target.checked)}
                  className="w-4 h-4 accent-orange-500"
                />
              </label>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-100 dark:bg-[#1A1E29] text-slate-700 dark:text-slate-300 font-semibold text-xs"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="flex-1 min-h-[42px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs"
              >
                {savingEdit ? 'Enregistrement...' : 'Appliquer en temps réel'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
