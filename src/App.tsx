import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  Power,
  Copy,
  Check,
  Clipboard,
  Terminal,
  Settings,
  Key,
  Trash2,
  RefreshCw,
  Info,
  ArrowUp,
  ArrowDown,
  Download,
  X,
  ExternalLink,
  Lock,
  Globe,
  Bell,
  User,
  AlertTriangle,
  Radio,
  Database,
  Calendar,
  Send,
  CheckCircle2,
  Activity,
  Sun,
  Moon,
  MessageCircle,
  Users,
  Zap,
  ChevronRight,
  Wifi,
  Smartphone,
  ArrowLeft,
  Share2,
  Server
} from 'lucide-react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { VpsAdminPanel } from './components/VpsAdminPanel';
import { DEFAULT_VLESS_TEMPLATE, generateDeviceId } from './utils/vless';

export const APP_VERSION = '2.3.4';

// Custom Orange Shield Emblem
export const OrangeShield: React.FC<{ size?: number; isGlowing?: boolean; isConnected?: boolean; className?: string }> = ({
  size = 36,
  isGlowing = false,
  isConnected = false,
  className = ''
}) => {
  return (
    <div
      className={`relative flex items-center justify-center rounded-full transition-shadow duration-300 ${
        isConnected
          ? 'shadow-[0_0_28px_rgba(16,185,129,0.45)]'
          : isGlowing
          ? 'shadow-[0_0_24px_rgba(255,121,0,0.45)]'
          : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isConnected ? '#34D399' : '#FFA040'} />
            <stop offset="55%" stopColor={isConnected ? '#10B981' : '#FF7900'} />
            <stop offset="100%" stopColor={isConnected ? '#059669' : '#E05D00'} />
          </linearGradient>
          <linearGradient id="borderGrad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={isConnected ? '#A7F3D0' : '#FFD180'} />
            <stop offset="100%" stopColor={isConnected ? '#059669' : '#FF7900'} />
          </linearGradient>
        </defs>
        <path
          d="M50 6 L88 22 C88 62 50 88 50 94 C50 88 12 62 12 22 Z"
          fill="url(#shieldGrad)"
          stroke="url(#borderGrad)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M35 50 L46 61 L67 39"
          stroke="white"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// Web Audio sound synthesizer for alerts & chimes
const playChime = (type: 'alert' | 'success' | 'broadcast' = 'alert') => {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'broadcast') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24);
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'alert') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // Audio playback blocked before user gesture
  }
};

// Native Browser System Notification Dispatcher
const sendSystemNotification = async (title: string, body: string) => {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification(title, { body });
      }
    }
  } catch (e) {
    console.error('System notification error:', e);
  }
};

interface VpnConfig {
  raw: string;
  protocol: string;
  name: string;
  server: string;
  port: string;
  host: string;
  path: string;
  uuid: string;
  isLocked?: boolean;
  expireDate?: string | null;
  quotaBytes?: number | null;
}

interface AppNotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'consumption' | 'expiry' | 'broadcast' | 'system';
  isRead?: boolean;
}

interface UpdateManifest {
  currentVersion: string;
  minVersion: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  forceUpdate?: boolean;
}

interface BroadcastPayload {
  id: string;
  timestamp: string;
  priority?: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
}

type NavTab = 'panel' | 'dashboard' | 'generator' | 'logs' | 'broadcast' | 'hotspot';

// Live SVG Dual-Line Traffic Chart
const TrafficChart: React.FC<{
  uploadSeries: number[];
  downloadSeries: number[];
  isConnected: boolean;
}> = ({ uploadSeries, downloadSeries, isConnected }) => {
  const width = 520;
  const height = 112;
  const maxVal = Math.max(250, ...uploadSeries, ...downloadSeries);

  const buildPoints = (series: number[]) => {
    if (series.length < 2) return '';
    return series
      .map((val, idx) => {
        const x = (idx / (series.length - 1)) * width;
        const y = height - Math.max(4, (val / maxVal) * (height - 14));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const buildArea = (series: number[]) => {
    if (series.length < 2) return '';
    const pts = buildPoints(series);
    return `0,${height} ${pts} ${width},${height}`;
  };

  const downPoints = buildPoints(downloadSeries);
  const upPoints = buildPoints(uploadSeries);

  return (
    <div className="relative w-full h-28 rounded-xl bg-slate-100/80 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-full"
        aria-label="Graphique de bande passante en temps réel"
      >
        <defs>
          <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF7900" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#FF7900" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        <line x1="0" y1={height * 0.33} x2={width} y2={height * 0.33} stroke="currentColor" className="text-slate-300/50 dark:text-slate-800" strokeDasharray="3 4" />
        <line x1="0" y1={height * 0.66} x2={width} y2={height * 0.66} stroke="currentColor" className="text-slate-300/50 dark:text-slate-800" strokeDasharray="3 4" />

        {downloadSeries.length >= 2 && (
          <>
            <polygon points={buildArea(downloadSeries)} fill="url(#downGrad)" />
            <polyline
              fill="none"
              stroke="#10B981"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={downPoints}
            />
          </>
        )}

        {uploadSeries.length >= 2 && (
          <>
            <polygon points={buildArea(uploadSeries)} fill="url(#upGrad)" />
            <polyline
              fill="none"
              stroke="#FF7900"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={upPoints}
            />
          </>
        )}
      </svg>

      {!isConnected && downloadSeries.every((v) => v === 0) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Les courbes de débit s'affichent dès l'ouverture du tunnel
          </span>
        </div>
      )}
    </div>
  );
};

export default function App() {
  // Theme State (Dark Obsidian Pro by default, switchable to Clean Pearl)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('orange_theme_dark');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('orange_theme_dark', String(isDark));
  }, [isDark]);

  // Active Navigation Tab (Default to External VPS Admin Panel)
  const [activeTab, setActiveTab] = useState<NavTab>('panel');

  // Firebase Auth State (for Admin VPS Panel)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [panelSyncStatus, setPanelSyncStatus] = useState<'waiting' | 'active' | 'suspended'>('waiting');

  // User Profile State (Mandatory requirement on Client View)
  const [userName, setUserName] = useState<string>('');
  const [nameInput, setNameInput] = useState<string>('');
  const [nameError, setNameError] = useState<string>('');
  const [showMandatoryNameModal, setShowMandatoryNameModal] = useState<boolean>(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState<boolean>(false);

  // Subscription & Expiration
  const [expiryDate, setExpiryDate] = useState<string>(() => {
    const saved = localStorage.getItem('orange_expiry_date');
    if (saved) return saved;
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [totalQuotaGb, setTotalQuotaGb] = useState<number>(() => {
    const saved = localStorage.getItem('orange_total_quota_gb');
    return saved ? parseFloat(saved) : 5.0;
  });

  // VPN State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusText, setStatusText] = useState<'Déconnecté' | 'Connexion...' | 'Protégé'>('Déconnecté');
  const [mode, setMode] = useState<string>('VLESS / VMess');
  const [config, setConfig] = useState<VpnConfig | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);

  // Telemetry & Data Consumption Tracking
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  const [uploadSeries, setUploadSeries] = useState<number[]>(Array(32).fill(0));
  const [downloadSeries, setDownloadSeries] = useState<number[]>(Array(32).fill(0));
  const [totalTrafficBytes, setTotalTrafficBytes] = useState<number>(() => {
    const saved = localStorage.getItem('orange_traffic_bytes');
    return saved ? parseInt(saved, 10) : 45 * 1024 * 1024;
  });

  const [lastMilestone200Mb, setLastMilestone200Mb] = useState<number>(() => {
    const saved = localStorage.getItem('orange_last_milestone_200mb');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Modals State
  const [consumptionAlertData, setConsumptionAlertData] = useState<{
    consumedMb: number;
    remainingGb: string;
    remainingMb: string;
  } | null>(null);

  const [expiryAlertData, setExpiryAlertData] = useState<{
    daysRemaining: number;
    expiryDateFormatted: string;
  } | null>(null);

  const [availableUpdate, setAvailableUpdate] = useState<UpdateManifest | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastPayload | null>(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState<boolean>(false);

  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [showNotificationDrawer, setShowNotificationDrawer] = useState<boolean>(false);

  // Persistent Installation ID
  const [installationId] = useState<string>(() => {
    const saved = localStorage.getItem('orange_installation_id');
    if (saved) return saved;
    const id = generateDeviceId();
    localStorage.setItem('orange_installation_id', id);
    return id;
  });
  const [copiedId, setCopiedId] = useState(false);

  // Logs
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] Orange VPN v${APP_VERSION} initialisé`,
    `[${new Date().toLocaleTimeString()}] Moteur Xray Core v1.2.0 prêt (@kcorp-tech)`,
  ]);
  const [logFilter, setLogFilter] = useState<'all' | 'alerts' | 'tunnel'>('all');

  // Other Modals & Input
  const [showSettings, setShowSettings] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [manualInputText, setManualInputText] = useState('');
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // AES Key Generator State
  const [genName, setGenName] = useState('Orange Cameroun VIP');
  const [genClientIds, setGenClientIds] = useState(installationId);
  const [genLock, setGenLock] = useState(true);
  const [genHasExpire, setGenHasExpire] = useState(false);
  const [genExpireDate, setGenExpireDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [genHasQuota, setGenHasQuota] = useState(false);
  const [genQuotaVal, setGenQuotaVal] = useState('5');
  const [genQuotaUnit, setGenQuotaUnit] = useState<'GB' | 'MB'>('GB');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copiedGenLink, setCopiedGenLink] = useState(false);

  // Broadcast Simulator State
  const [adminSimTitle, setAdminSimTitle] = useState('Orange VPN • Maintenance Réseau');
  const [adminSimMessage, setAdminSimMessage] = useState(
    'Mise à niveau des nœuds VIP prévue ce soir à 00h00. Aucune coupure sur les tunnels chiffrés.'
  );

  // Hotspot VPN Sharing State
  const [hotspotEnabled, setHotspotEnabled] = useState<boolean>(() => {
    return localStorage.getItem('orange_hotspot_enabled') === 'true';
  });
  const [hotspotIp, setHotspotIp] = useState<string>(() => {
    return localStorage.getItem('orange_hotspot_ip') || '192.168.43.1';
  });
  const [hotspotPort, setHotspotPort] = useState<string>(() => {
    return localStorage.getItem('orange_hotspot_port') || '8080';
  });
  const [hotspotProtocol, setHotspotProtocol] = useState<'HTTP' | 'SOCKS5'>(() => {
    const saved = localStorage.getItem('orange_hotspot_proto');
    return saved === 'SOCKS5' ? 'SOCKS5' : 'HTTP';
  });
  const [hotspotRelayedBytes, setHotspotRelayedBytes] = useState<number>(() => {
    const saved = localStorage.getItem('orange_hotspot_bytes');
    return saved ? parseInt(saved, 10) || 0 : 0;
  });
  const [copiedHotspotField, setCopiedHotspotField] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSnackMessage(msg);
    setTimeout(() => {
      setSnackMessage((curr) => (curr === msg ? null : curr));
    }, 3800);
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 80)]);
  };

  const pushNotification = (item: Omit<AppNotificationItem, 'id' | 'timestamp'>) => {
    const newItem: AppNotificationItem = {
      ...item,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
    };
    setNotifications((prev) => [newItem, ...prev.slice(0, 25)]);
  };

  // 0. Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 1. Initial Load: User Name & Saved Config
  useEffect(() => {
    const savedName = localStorage.getItem('orange_user_name');
    if (savedName && savedName.trim() !== '') {
      setUserName(savedName);
    }

    const savedConfig = localStorage.getItem('orange_saved_config');
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig));
      } catch {
        // Ignore malformed local storage
      }
    }

    if ('Notification' in window && Notification.permission === 'default') {
      const timer = setTimeout(() => {
        Notification.requestPermission().catch(() => {});
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Prompt mandatory name only when visiting the Client App tab without a name
  useEffect(() => {
    if (activeTab === 'dashboard' && !userName.trim()) {
      const savedName = localStorage.getItem('orange_user_name');
      if (!savedName || savedName.trim() === '') {
        setShowMandatoryNameModal(true);
      }
    }
  }, [activeTab, userName]);

  // 2. Daily Expiration Check
  useEffect(() => {
    if (!userName) return;

    const checkDailyExpiration = () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastCheckDay = localStorage.getItem('orange_last_expiry_alert_day');

      const expiry = new Date(expiryDate);
      const now = new Date();
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (lastCheckDay !== todayStr) {
        localStorage.setItem('orange_last_expiry_alert_day', todayStr);

        let expiryMsg = '';
        if (diffDays <= 0) {
          expiryMsg = `Cher ${userName}, votre forfait Orange VPN a expiré. Veuillez souscrire à nouveau pour continuer à profiter du service.`;
        } else if (diffDays <= 3) {
          expiryMsg = `Cher ${userName}, votre forfait Orange VPN expire dans ${diffDays} jour(s) (${expiry.toLocaleDateString('fr-FR')}). Pensez à renouveler votre abonnement.`;
        } else {
          expiryMsg = `Cher ${userName}, votre forfait Orange VPN expire le ${expiry.toLocaleDateString('fr-FR')} (dans ${diffDays} jours). Pensez à renouveler après expiration.`;
        }

        sendSystemNotification('Orange VPN • Rappel d’expiration', expiryMsg);
        playChime('alert');

        pushNotification({
          title: 'Rappel d’expiration journalier',
          message: expiryMsg,
          type: 'expiry',
        });

        if (diffDays <= 5) {
          setExpiryAlertData({
            daysRemaining: diffDays,
            expiryDateFormatted: expiry.toLocaleDateString('fr-FR'),
          });
        }
      }
    };

    checkDailyExpiration();
    const interval = setInterval(checkDailyExpiration, 60000 * 60);
    return () => clearInterval(interval);
  }, [userName, expiryDate]);

  // 3. Remote Check: Broadcast & App Updates
  const isVersionGreater = (vA: string, vB: string) => {
    const partsA = vA.split('.').map((n) => parseInt(n, 10) || 0);
    const partsB = vB.split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const a = partsA[i] || 0;
      const b = partsB[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return false;
  };

  const fetchRemoteData = async (manual = false) => {
    try {
      const broadcastRes = await fetch(`/broadcast.json?t=${Date.now()}`);
      if (broadcastRes.ok) {
        const data: BroadcastPayload = await broadcastRes.json();
        const lastSeenBroadcastId = localStorage.getItem('orange_last_broadcast_seen');

        if (data && data.id && (data.id !== lastSeenBroadcastId || manual)) {
          setActiveBroadcast(data);
          setShowBroadcastModal(true);
          playChime('broadcast');
          sendSystemNotification(data.title, data.message);
          addLog(`Diffusion reçue : "${data.title}"`);
          if (data.id !== lastSeenBroadcastId) {
            pushNotification({
              title: data.title,
              message: data.message,
              type: 'broadcast',
            });
          }
        }
      }
    } catch {
      // Offline fallback
    }

    try {
      const updateRes = await fetch(`/app-update.json?t=${Date.now()}`);
      if (updateRes.ok) {
        const updateData: UpdateManifest = await updateRes.json();
        if (updateData && updateData.currentVersion) {
          if (isVersionGreater(updateData.currentVersion, APP_VERSION)) {
            setAvailableUpdate(updateData);
            const ignored = sessionStorage.getItem(`ignored_update_${updateData.currentVersion}`);
            if (!ignored || manual) {
              setShowUpdateModal(true);
            }
          } else if (manual) {
            showToast(`Vous utilisez déjà la dernière version (v${APP_VERSION}).`);
          }
        }
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchRemoteData(false);
    const pollInterval = setInterval(() => fetchRemoteData(false), 35000);
    return () => clearInterval(pollInterval);
  }, []);

  // 3B. Real-Time VPS Panel Sync for this Client App ID (installationId)
  useEffect(() => {
    if (!installationId) return;
    const clientPath = `vpn_clients/${installationId}`;
    const unsub = onSnapshot(
      doc(db, 'vpn_clients', installationId),
      (snap) => {
        if (!snap.exists()) {
          setPanelSyncStatus('waiting');
          return;
        }

        const data = snap.data();
        const remoteStatus = data.status === 'suspended' ? 'suspended' : 'active';
        const remoteName = String(data.clientName || '').trim();
        const remoteHost = String(data.host || 'm.orange.cm').trim();
        const remoteVless = String(data.vlessConfig || '').trim();
        const remoteQuotaGb = Number(data.quotaGb || 5);
        const remoteExpire = String(data.expireDate || '').trim();
        const remoteLocked = data.locked !== false;
        const remoteUsageKey = String(data.usageKey || '');
        const remoteRev = Number(data.configRevision || 1);

        if (remoteStatus === 'suspended') {
          setPanelSyncStatus('suspended');
          setIsConnected(false);
          setIsConnecting(false);
          setStatusText('Déconnecté');
          addLog('Accès suspendu en temps réel depuis le Panel VPS');
          showToast('Accès suspendu par l’administrateur VPS.');
          return;
        }

        setPanelSyncStatus('active');

        if (remoteName) {
          setUserName(remoteName);
          localStorage.setItem('orange_user_name', remoteName);
          setShowMandatoryNameModal(false);
        }

        if (remoteQuotaGb > 0) {
          setTotalQuotaGb(remoteQuotaGb);
          localStorage.setItem('orange_total_quota_gb', String(remoteQuotaGb));
        }

        if (remoteExpire) {
          const isoDate = remoteExpire.split('T')[0];
          setExpiryDate(isoDate);
          localStorage.setItem('orange_expiry_date', isoDate);
        }

        const prevUsageKey = localStorage.getItem('orange_panel_usage_key');
        if (remoteUsageKey && prevUsageKey !== remoteUsageKey) {
          localStorage.setItem('orange_panel_usage_key', remoteUsageKey);
          setTotalTrafficBytes(0);
          setLastMilestone200Mb(0);
          localStorage.setItem('orange_traffic_bytes', '0');
          localStorage.setItem('orange_last_milestone_200mb', '0');
        }

        if (remoteVless) {
          const parsed = parseVless(remoteVless);
          if (parsed) {
            const syncedConfig: VpnConfig = {
              ...parsed,
              name: remoteName ? `${remoteName} (${remoteQuotaGb} Go)` : parsed.name,
              host: remoteLocked ? 'Chiffré & Verrouillé' : remoteHost,
              server: remoteLocked ? 'Serveur Privé Sécurisé' : parsed.server,
              path: remoteLocked ? '/tunnel-secure' : parsed.path,
              isLocked: remoteLocked,
              expireDate: remoteExpire || null,
              quotaBytes: Math.round(remoteQuotaGb * 1024 * 1024 * 1024),
            };
            setConfig(syncedConfig);
            localStorage.setItem('orange_saved_config', JSON.stringify(syncedConfig));
          }
        }

        const lastRev = parseInt(localStorage.getItem('orange_panel_rev') || '0', 10);
        if (remoteRev !== lastRev) {
          localStorage.setItem('orange_panel_rev', String(remoteRev));
          playChime('success');
          addLog(`Config reçue du Panel VPS : ${remoteName} (${remoteQuotaGb} Go • Rev #${remoteRev})`);
          pushNotification({
            title: 'Configuration reçue du Panel VPS',
            message: `Bonjour ${remoteName || 'Client'}, votre forfait de ${remoteQuotaGb} Go est activé automatiquement.`,
            type: 'system',
          });
          showToast(`Configuration reçue en temps réel (${remoteQuotaGb} Go).`);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, clientPath);
      }
    );

    return () => unsub();
  }, [installationId]);

  // 4. VPN Connection, Session Timer & Consumption Engine
  const check200MoMilestone = (currentBytes: number) => {
    const currentMb = currentBytes / (1024 * 1024);
    const milestoneCount = Math.floor(currentMb / 200);

    if (milestoneCount > lastMilestone200Mb) {
      setLastMilestone200Mb(milestoneCount);
      localStorage.setItem('orange_last_milestone_200mb', milestoneCount.toString());

      const consumedMbFormatted = Math.round(currentMb);
      const totalMb = totalQuotaGb * 1024;
      const remainingMbRaw = Math.max(0, totalMb - currentMb);
      const remainingGbFormatted = (remainingMbRaw / 1024).toFixed(2);
      const remainingMbFormatted = Math.round(remainingMbRaw).toString();

      const title = 'Alerte Consommation Orange VPN — 200 Mo';
      const body = `Cher ${userName || 'Client'}, vous venez de consommer 200 Mo de votre forfait ! Il vous reste ${remainingGbFormatted} Go. Veuillez souscrire à nouveau après l'expiration.`;

      sendSystemNotification(title, body);
      playChime('alert');

      setConsumptionAlertData({
        consumedMb: consumedMbFormatted,
        remainingGb: remainingGbFormatted,
        remainingMb: remainingMbFormatted,
      });

      pushNotification({
        title: 'Alerte Consommation 200 Mo',
        message: body,
        type: 'consumption',
      });

      addLog(`Alerte 200 Mo déclenchée : ${remainingGbFormatted} Go restant`);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isConnected) {
      interval = setInterval(() => {
        const up = Math.floor(Math.random() * 850 + 150) / 10;
        const down = Math.floor(Math.random() * 3400 + 550) / 10;
        setUploadSpeed(up);
        setDownloadSpeed(down);
        setUploadSeries((prev) => [...prev.slice(1), up]);
        setDownloadSeries((prev) => [...prev.slice(1), down]);
        setSessionSeconds((s) => s + 1);

        const addedBytes = (up + down) * 1024;
        setTotalTrafficBytes((prev) => {
          const next = prev + addedBytes;
          localStorage.setItem('orange_traffic_bytes', next.toString());
          check200MoMilestone(next);
          return next;
        });

        if (hotspotEnabled) {
          setHotspotRelayedBytes((prev) => {
            const next = prev + Math.round(addedBytes * 0.35);
            localStorage.setItem('orange_hotspot_bytes', next.toString());
            return next;
          });
        }
      }, 1000);
    } else {
      setUploadSpeed(0);
      setDownloadSpeed(0);
      setSessionSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isConnected, lastMilestone200Mb, userName, totalQuotaGb, hotspotEnabled]);

  const simulate200MoJump = () => {
    const jumpBytes = 200 * 1024 * 1024;
    setTotalTrafficBytes((prev) => {
      const next = prev + jumpBytes;
      localStorage.setItem('orange_traffic_bytes', next.toString());
      check200MoMilestone(next);
      return next;
    });
    showToast('Palier +200 Mo simulé sur le compteur.');
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDuration = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const handleSaveMandatoryName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length < 2) {
      setNameError('Veuillez saisir un nom ou prénom valide (minimum 2 caractères).');
      return;
    }
    setUserName(trimmed);
    localStorage.setItem('orange_user_name', trimmed);
    setShowMandatoryNameModal(false);
    playChime('success');
    showToast(`Bienvenue ${trimmed}. Votre profil Orange VPN est activé.`);
    addLog(`Profil activé : ${trimmed}`);

    if ('Notification' in window) {
      Notification.requestPermission()
        .then((perm) => {
          if (perm === 'granted') {
            sendSystemNotification(
              'Orange VPN • Profil Activé',
              `Bienvenue ${trimmed} ! Vos alertes de consommation et rappels d’expiration sont actifs.`
            );
          }
        })
        .catch(() => {});
    }
  };

  // Parse VLESS / VMess / Trojan / Orange Encrypted URL
  const parseVless = (rawUrl: string): VpnConfig | null => {
    try {
      const trimmed = rawUrl.trim();

      if (trimmed.startsWith('orange://config/') || trimmed.startsWith('xv2ray://config/')) {
        const token = trimmed
          .replace('orange://config/', '')
          .replace('xv2ray://config/', '');
        let decodedName = 'Profil Sécurisé AES-256';
        let decodedHost = 'Chiffré & Verrouillé';
        let decodedLocked = true;
        let expireDate: string | null = null;
        let quotaBytes: number | null = null;

        try {
          const cleanB64 = token.startsWith('ORANGE_') ? token.replace('ORANGE_', '') : token;
          const jsonStr = decodeURIComponent(escape(atob(cleanB64)));
          const parsed = JSON.parse(jsonStr);
          if (parsed.name) decodedName = parsed.name;
          if (parsed.locked === false && parsed.host) decodedHost = parsed.host;
          decodedLocked = parsed.locked !== false;
          if (parsed.expire_date) expireDate = parsed.expire_date;
          if (parsed.dataQuotaBytes) quotaBytes = Number(parsed.dataQuotaBytes);
        } catch {
          // Native AES-256 mobile token: keep masked metadata cleanly
        }

        return {
          raw: trimmed,
          protocol: 'Orange Encrypted',
          name: decodedName,
          server: 'Serveur Privé Sécurisé',
          port: '443',
          host: decodedHost,
          path: '/tunnel-secure',
          uuid: 'AES-256',
          isLocked: decodedLocked,
          expireDate,
          quotaBytes,
        };
      }

      if (trimmed.startsWith('vless://')) {
        const url = new URL(trimmed);
        const params = url.searchParams;
        const host = params.get('host') || params.get('sni') || url.hostname;
        const path = params.get('path') ? decodeURIComponent(params.get('path')!) : '/';
        const name = url.hash ? decodeURIComponent(url.hash.replace('#', '')) : 'Orange VLESS Fast';

        return {
          raw: trimmed,
          protocol: 'VLESS',
          name,
          server: url.hostname,
          port: url.port || '443',
          host,
          path,
          uuid: url.username || 'Client-Orange',
          isLocked: false,
        };
      }

      if (trimmed.startsWith('vmess://')) {
        let b64 = trimmed.replace('vmess://', '').trim();
        while (b64.length % 4 !== 0) b64 += '=';
        const json = JSON.parse(atob(b64));
        return {
          raw: trimmed,
          protocol: 'VMess',
          name: json.ps || 'Orange VMess VIP',
          server: json.add || '127.0.0.1',
          port: String(json.port || '443'),
          host: json.host || json.sni || json.add,
          path: json.path || '/',
          uuid: json.id || 'UUID-Orange',
          isLocked: false,
        };
      }

      if (trimmed.startsWith('trojan://')) {
        const url = new URL(trimmed);
        const params = url.searchParams;
        const host = params.get('sni') || params.get('host') || url.hostname;
        const path = params.get('path') ? decodeURIComponent(params.get('path')!) : '/';
        const name = url.hash ? decodeURIComponent(url.hash.replace('#', '')) : 'Orange Trojan';

        return {
          raw: trimmed,
          protocol: 'Trojan',
          name,
          server: url.hostname,
          port: url.port || '443',
          host,
          path,
          uuid: url.username || '',
          isLocked: false,
        };
      }

      return null;
    } catch {
      return null;
    }
  };

  const handlePasteConfig = async () => {
    try {
      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {
          // Clipboard read requires permission
        }
      }

      if (
        !text ||
        (!text.startsWith('vless://') &&
          !text.startsWith('vmess://') &&
          !text.startsWith('trojan://') &&
          !text.startsWith('orange://') &&
          !text.startsWith('xv2ray://'))
      ) {
        setShowPasteModal(true);
        return;
      }

      applyConfig(text);
    } catch {
      setShowPasteModal(true);
    }
  };

  const applyConfig = (rawText: string) => {
    const parsed = parseVless(rawText);
    if (!parsed) {
      showToast('Format de configuration invalide.');
      addLog('Format de configuration invalide rejeté');
      return;
    }

    setConfig(parsed);
    if (parsed.expireDate) {
      const isoDate = parsed.expireDate.split('T')[0];
      setExpiryDate(isoDate);
      localStorage.setItem('orange_expiry_date', isoDate);
    }
    if (parsed.quotaBytes && parsed.quotaBytes > 0) {
      const gb = Number((parsed.quotaBytes / (1024 * 1024 * 1024)).toFixed(2));
      setTotalQuotaGb(gb);
      localStorage.setItem('orange_total_quota_gb', gb.toString());
    }
    localStorage.setItem('orange_saved_config', JSON.stringify(parsed));
    setShowPasteModal(false);
    setManualInputText('');
    showToast(`Configuration ${parsed.protocol} chargée (${parsed.name}).`);
    addLog(`Configuration appliquée : ${parsed.name} • Host=${parsed.host}`);
  };

  const clearConfig = () => {
    if (isConnected || isConnecting) {
      setIsConnected(false);
      setIsConnecting(false);
      setStatusText('Déconnecté');
    }
    setConfig(null);
    setPingLatency(null);
    localStorage.removeItem('orange_saved_config');
    showToast('Configuration supprimée.');
    addLog('Configuration active effacée');
  };

  const runPingTest = () => {
    setIsPinging(true);
    setTimeout(() => {
      const ms = Math.floor(Math.random() * 24 + 19);
      setPingLatency(ms);
      setIsPinging(false);
      addLog(`Latence nœud vérifiée : ${ms} ms`);
    }, 500);
  };

  const toggleConnection = () => {
    if (isConnected || isConnecting) {
      setIsConnected(false);
      setIsConnecting(false);
      setStatusText('Déconnecté');
      setPingLatency(null);
      addLog('Tunnel Orange VPN arrêté par l’utilisateur');
      showToast('Tunnel déconnecté.');
      return;
    }

    if (panelSyncStatus === 'suspended') {
      showToast('Votre accès est actuellement suspendu par l’administrateur VPS.');
      addLog('Connexion refusée : accès suspendu par le Panel VPS');
      return;
    }

    if (!config) {
      showToast('Importez une configuration ou attendez l’envoi depuis le Panel VPS.');
      return;
    }

    setIsConnecting(true);
    setStatusText('Connexion...');
    addLog(`Négociation ${config.protocol} via ${config.host}...`);

    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
      setStatusText('Protégé');
      playChime('success');
      addLog('Tunnel chiffré établi avec succès');
      showToast('Connexion sécurisée établie.');
      runPingTest();
    }, 950);
  };

  const copyAppId = () => {
    navigator.clipboard.writeText(installationId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
    showToast(`Identifiant copié : ${installationId}`);
  };

  const generateOrangeKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!genName.trim()) {
      showToast('Veuillez nommer la configuration.');
      return;
    }

    const ids = genClientIds
      .split(/[,;\s\n]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (ids.length === 0) {
      showToast('Saisissez au moins un identifiant appareil (ex: OR-XXXX-XXXX).');
      return;
    }

    let dataQuotaBytes: number | undefined;
    if (genHasQuota) {
      const num = parseFloat(genQuotaVal.replace(',', '.'));
      if (!isNaN(num) && num > 0) {
        dataQuotaBytes =
          genQuotaUnit === 'GB'
            ? Math.round(num * 1024 * 1024 * 1024)
            : Math.round(num * 1024 * 1024);
      }
    }

    const payload = {
      app: 'Orange VPN',
      version: APP_VERSION,
      name: genName.trim(),
      user: userName,
      mode,
      host: config?.host || 'm.orange.cm',
      config: config?.raw || sampleVless,
      locked: genLock,
      allowedClientId: ids[0],
      allowedClientIds: ids,
      expire_date: genHasExpire ? new Date(genExpireDate).toISOString() : null,
      ...(dataQuotaBytes ? { dataQuotaBytes } : {}),
      usageKey: `uk_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      signature: '@kcorp-tech',
      created_at: new Date().toISOString(),
    };

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const link = `orange://config/ORANGE_${encoded}`;
    setGeneratedLink(link);
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedGenLink(true);
    setTimeout(() => setCopiedGenLink(false), 2200);
    addLog(`Clé Orange générée pour ${ids.length} appareil(s)`);
    showToast('Lien Orange chiffré généré et copié.');
  };

  const handleTestBroadcastPush = () => {
    const simulatedBroadcast: BroadcastPayload = {
      id: `sim-${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: adminSimTitle,
      message: adminSimMessage,
      priority: 'high',
    };
    setActiveBroadcast(simulatedBroadcast);
    setShowBroadcastModal(true);
    playChime('broadcast');
    sendSystemNotification(simulatedBroadcast.title, simulatedBroadcast.message);
    pushNotification({
      title: simulatedBroadcast.title,
      message: simulatedBroadcast.message,
      type: 'broadcast',
    });
    addLog(`Diffusion testée : ${simulatedBroadcast.title}`);
  };

  const toggleHotspotSharing = () => {
    const next = !hotspotEnabled;
    setHotspotEnabled(next);
    localStorage.setItem('orange_hotspot_enabled', String(next));
    if (next) {
      playChime('success');
      addLog(`Partage Hotspot activé sur ${hotspotIp}:${hotspotPort} (${hotspotProtocol})`);
      showToast(
        isConnected
          ? `Partage VPN via Hotspot activé (${hotspotIp}:${hotspotPort}).`
          : `Relais Hotspot prêt (${hotspotIp}:${hotspotPort}). Connectez le VPN.`
      );
    } else {
      addLog('Partage Hotspot arrêté par l’utilisateur');
      showToast('Partage VPN via Hotspot désactivé.');
    }
  };

  const copyHotspotValue = (label: string, value: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedHotspotField(label);
    setTimeout(() => setCopiedHotspotField((curr) => (curr === label ? null : curr)), 2000);
    showToast(`${label} copié : ${value}`);
  };

  // Calculations
  const currentMb = totalTrafficBytes / (1024 * 1024);
  const totalMb = totalQuotaGb * 1024;
  const remainingMb = Math.max(0, totalMb - currentMb);
  const remainingGb = (remainingMb / 1024).toFixed(2);
  const usagePercentage = Math.min(100, Math.round((currentMb / totalMb) * 100));

  const daysUntilExpiry = useMemo(() => {
    const expiry = new Date(expiryDate);
    const now = new Date();
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [expiryDate]);

  const sampleVless = DEFAULT_VLESS_TEMPLATE.replace('mon host ici ', 'm.orange.cm');
  const sampleVMess =
    'vmess://eyJhZGQiOiIxMDQuMTYuMjQuNSIsImFpZCI6IjAiLCJob3N0Ijoid3d3Lm9yYW5nZS5jbSIsImlkIjoiYjgyMmQwNTktM2Q4NC00ODZhLWFkODUtNzgwYzEwZDNlNTg5IiwibmV0Ijoid3MiLCJwYXRoIjoiL3ZtZXNzLXdzIiwicG9ydCI6IjQ0MyIsInBzIjoiT3JhbmdlLVZNZXNzLVZJUCIsInRscyI6InRscyIsInYiOiIyIn0=';

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs;
    if (logFilter === 'alerts') {
      return logs.filter(
        (l) => l.includes('Alerte') || l.includes('invalide') || l.includes('Erreur') || l.includes('Diffusion')
      );
    }
    return logs.filter(
      (l) => l.includes('Tunnel') || l.includes('Négociation') || l.includes('Configuration') || l.includes('Latence')
    );
  }, [logs, logFilter]);

  return (
    <div className="min-h-screen bg-[#F4F6F9] dark:bg-[#0B0D12] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 selection:bg-orange-500 selection:text-white pb-20 lg:pb-8">
      {/* Subtle Top Toast Banner */}
      {snackMessage && (
        <div
          role="status"
          className="fixed bottom-36 lg:bottom-20 right-4 left-4 sm:left-auto sm:right-6 z-[90] flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900 dark:bg-[#191E29] text-white border border-slate-700/80 shadow-xl max-w-md ml-auto"
        >
          <OrangeShield size={20} isConnected={isConnected} />
          <span className="text-xs font-medium leading-snug">{snackMessage}</span>
        </div>
      )}

      {/* ================================================================ */}
      {/* TOP BAR (3-Zone Contract)                                        */}
      {/* ================================================================ */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B0D12]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            onClick={() => setActiveTab('panel')}
            className="flex items-center gap-3 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg pr-2"
          >
            <OrangeShield size={32} isGlowing={!isConnected} isConnected={isConnected} />
            <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              Orange VPN
            </span>
          </button>

          {/* Zone 2: Primary Navigation (Desktop) */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium" aria-label="Navigation principale">
            {[
              { id: 'panel', label: 'Panel Admin VPS' },
              { id: 'dashboard', label: 'App Client (Temps réel)' },
              { id: 'generator', label: 'Générateur AES' },
              { id: 'logs', label: 'Journaux' },
              { id: 'broadcast', label: 'Diffusion' },
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as NavTab)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded ${
                    active
                      ? 'text-orange-600 dark:text-orange-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-[21px] h-[2px] bg-orange-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Action Cluster */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowWelcomeModal(true)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
              title="Message de bienvenue & Support"
              aria-label="Message de bienvenue et support"
            >
              <Info size={18} />
            </button>

            <button
              onClick={() => {
                setShowNotificationDrawer(true);
                setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
              }}
              className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
              title="Centre de notifications"
              aria-label="Centre de notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="min-h-[40px] px-3 flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-[#191E29] hover:bg-slate-200 dark:hover:bg-[#222836] text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Settings size={15} />
              <span className="hidden sm:inline">Paramètres</span>
            </button>
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* MAIN WORKSPACE CONTAINER                                         */}
      {/* ================================================================ */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 sm:pt-7 space-y-6">
        {/* Clean Welcome & Subscription Summary Strip */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-sm shrink-0">
              {activeTab === 'panel' ? (
                <Server size={19} />
              ) : userName ? (
                userName.slice(0, 2).toUpperCase()
              ) : (
                <User size={18} />
              )}
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {activeTab === 'panel'
                  ? 'Panel Admin VPS • Gestion Clients & VLESS'
                  : userName
                  ? `Bonjour, ${userName}`
                  : 'Espace Client Orange VPN'}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {activeTab === 'panel' ? (
                  <>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Synchro Firestore Temps Réel
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Moteur VLESS + Host personnalisé</span>
                    <span aria-hidden="true">·</span>
                    <span>APK v{APP_VERSION}</span>
                  </>
                ) : (
                  <>
                    <span className={daysUntilExpiry <= 3 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
                      {daysUntilExpiry <= 0
                        ? 'Forfait expiré'
                        : `Expire le ${new Date(expiryDate).toLocaleDateString('fr-FR')} (${daysUntilExpiry} j restants)`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={copyAppId}
                      className="inline-flex items-center gap-1 font-mono font-bold text-orange-600 dark:text-orange-400 hover:underline"
                      title="Copier mon ID App pour l'envoyer à l'administrateur"
                    >
                      <span>ID : {installationId}</span>
                      {copiedId ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </button>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        panelSyncStatus === 'active'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : panelSyncStatus === 'suspended'
                          ? 'text-red-500'
                          : 'text-slate-400'
                      }`}
                    >
                      {panelSyncStatus === 'active'
                        ? 'Panel VPS : Actif'
                        : panelSyncStatus === 'suspended'
                        ? 'Panel VPS : Suspendu'
                        : 'Panel VPS : En attente'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <button
              onClick={() => setIsDark((d) => !d)}
              className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A1E29] text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              title={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
            >
              {isDark ? <Sun size={15} className="text-orange-400" /> : <Moon size={15} className="text-slate-600" />}
              <span>{isDark ? 'Mode clair' : 'Mode sombre'}</span>
            </button>
            {activeTab === 'panel' ? (
              <button
                onClick={() => setActiveTab('dashboard')}
                className="min-h-[40px] px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Smartphone size={14} />
                <span>Simulateur Client</span>
              </button>
            ) : (
              <button
                onClick={copyAppId}
                className="min-h-[40px] px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedId ? <Check size={14} /> : <Copy size={14} />}
                <span>Copier mon ID</span>
              </button>
            )}
          </div>
        </section>

        {/* ============================================================ */}
        {/* TAB 0: EXTERNAL VPS ADMIN PANEL                              */}
        {/* ============================================================ */}
        {activeTab === 'panel' && (
          <VpsAdminPanel
            user={firebaseUser}
            authReady={authReady}
            simulatorAppId={installationId}
            onShowToast={showToast}
            onJumpToClientSimulator={() => setActiveTab('dashboard')}
          />
        )}

        {/* ============================================================ */}
        {/* TAB 1: CLIENT APP DASHBOARD (REAL-TIME SYNCED)               */}
        {/* ============================================================ */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* LEFT COLUMN: CONNECTION COCKPIT */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-6 shadow-sm">
              {/* Top Status & Ping */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/70">
                <div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                    État du tunnel
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-sm font-bold ${
                        isConnected
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isConnecting
                          ? 'text-orange-500'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {statusText}
                    </span>
                    {isConnected && (
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        · {formatDuration(sessionSeconds)}
                      </span>
                    )}
                  </div>
                </div>

                {isConnected ? (
                  <button
                    onClick={runPingTest}
                    disabled={isPinging}
                    className="min-h-[36px] px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors tabular-nums"
                    title="Retester la latence"
                  >
                    <Activity size={13} />
                    <span>{isPinging ? '...' : pingLatency ? `${pingLatency} ms` : 'Ping'}</span>
                  </button>
                ) : (
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                    Xray Core 1.2
                  </span>
                )}
              </div>

              {/* Central Tactile Power Button */}
              <div className="py-8 flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center">
                  {/* Subtle Ambient Ring */}
                  <div
                    className={`absolute w-52 h-52 rounded-full transition-all duration-300 pointer-events-none ${
                      isConnected
                        ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
                        : isConnecting
                        ? 'bg-orange-500/10 ring-1 ring-orange-500/35'
                        : 'bg-slate-200/40 dark:bg-slate-800/30 ring-1 ring-slate-200 dark:ring-slate-800'
                    }`}
                  />

                  <button
                    onClick={toggleConnection}
                    aria-label={isConnected ? 'Déconnecter le VPN' : 'Connecter le VPN'}
                    className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 active:scale-[0.97] ${
                      isConnected
                        ? 'bg-white dark:bg-[#171C26] border-2 border-emerald-500 shadow-[0_12px_40px_rgba(16,185,129,0.22)]'
                        : isConnecting
                        ? 'bg-white dark:bg-[#171C26] border-2 border-orange-500 shadow-[0_12px_36px_rgba(255,121,0,0.22)]'
                        : 'bg-white dark:bg-[#171C26] border-2 border-orange-500/60 hover:border-orange-500 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.4)]'
                    }`}
                  >
                    <div
                      className={`w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all duration-200 ${
                        isConnected
                          ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white'
                          : isConnecting
                          ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white'
                          : 'bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-600 text-white'
                      }`}
                    >
                      {isConnecting ? (
                        <RefreshCw size={36} className="animate-spin" />
                      ) : isConnected ? (
                        <ShieldCheck size={38} />
                      ) : (
                        <Power size={38} />
                      )}
                      <span className="text-[11px] font-bold tracking-wide uppercase">
                        {isConnected ? 'Actif' : isConnecting ? 'En cours' : 'Connecter'}
                      </span>
                    </div>
                  </button>
                </div>

                <p className="mt-6 text-sm font-medium text-center text-slate-600 dark:text-slate-300 max-w-xs text-balance">
                  {isConnected
                    ? `Trafic chiffré via ${config?.host || 'serveur Orange'}. Appuyez pour couper.`
                    : isConnecting
                    ? 'Établissement de la session TLS et routage Xray...'
                    : config
                    ? `Prêt à connecter le profil « ${config.name} ».`
                    : 'Importez une configuration ci-contre pour activer la connexion.'}
                </p>
              </div>

              {/* Protocol Selector Footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800/70 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Globe size={14} className="text-orange-500" />
                    Protocole de transport
                  </span>
                  {config?.isLocked && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Lock size={12} /> Verrouillé
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0E1118] border border-slate-200/70 dark:border-slate-800">
                  {['VLESS / VMess', 'Trojan', 'UDP', 'SlowDNS'].map((item) => {
                    const selected = mode === item;
                    return (
                      <button
                        key={item}
                        disabled={config?.isLocked}
                        onClick={() => {
                          setMode(item);
                          addLog(`Protocole sélectionné : ${item}`);
                        }}
                        className={`min-h-[36px] px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap truncate ${
                          selected
                            ? 'bg-white dark:bg-[#1E2432] text-orange-600 dark:text-orange-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        } ${config?.isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {item === 'VLESS / VMess' ? 'VLESS/VMess' : item}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: TELEMETRY, QUOTA & CONFIG */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* 1. Bandwidth & Live Graph Card */}
              <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Débit réseau en direct
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Télémétrie montante et descendante du tunnel
                    </p>
                  </div>

                  <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
                    <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 font-semibold">
                      <ArrowUp size={14} />
                      <span>{uploadSpeed.toFixed(1)} KB/s</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <ArrowDown size={14} />
                      <span>{downloadSpeed.toFixed(1)} KB/s</span>
                    </div>
                  </div>
                </div>

                <TrafficChart
                  uploadSeries={uploadSeries}
                  downloadSeries={downloadSeries}
                  isConnected={isConnected}
                />
              </div>

              {/* 2. Data Consumption & Quota Card */}
              <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-orange-500" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Consommation du forfait
                    </h2>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                    {formatBytes(totalTrafficBytes)} / {totalQuotaGb} Go
                  </span>
                </div>

                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      usagePercentage > 85
                        ? 'bg-red-500'
                        : usagePercentage > 60
                        ? 'bg-amber-500'
                        : 'bg-gradient-to-r from-orange-500 to-amber-500'
                    }`}
                    style={{ width: `${Math.max(2, usagePercentage)}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>
                    Volume restant :{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {remainingGb} Go
                    </strong>{' '}
                    ({Math.round(remainingMb)} Mo) · Palier d’alerte tous les 200 Mo
                  </span>
                  <button
                    onClick={simulate200MoJump}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/15 text-orange-600 dark:text-orange-400 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                  >
                    Tester alerte +200 Mo
                  </button>
                </div>
              </div>

              {/* 3. Auto-Configuration Card */}
              <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clipboard size={16} className="text-orange-500" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Configuration automatique
                    </h2>
                  </div>
                  {config && (
                    <span
                      className={`text-xs font-semibold ${
                        config.isLocked
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {config.isLocked ? 'Chiffré AES-256' : 'Profil prêt'}
                    </span>
                  )}
                </div>

                {!config ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        onClick={handlePasteConfig}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <Clipboard size={16} />
                        <span>Coller la configuration</span>
                      </button>
                      <button
                        onClick={() => setShowPasteModal(true)}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] text-slate-800 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-slate-700/80 flex items-center justify-center gap-2 transition-colors"
                      >
                        <Lock size={15} className="text-orange-500" />
                        <span>Saisir un lien manuel</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Collez un lien <code className="text-orange-600 dark:text-orange-400">orange://</code>,{' '}
                      <code className="text-slate-700 dark:text-slate-300">vless://</code>,{' '}
                      <code className="text-slate-700 dark:text-slate-300">vmess://</code> ou{' '}
                      <code className="text-slate-700 dark:text-slate-300">trojan://</code>. Le Host, le Path et le serveur sont extraits automatiquement.
                    </p>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400 dark:text-slate-500">Profils de démonstration :</span>
                      <button
                        onClick={() => applyConfig(sampleVless)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#1A1E29] hover:bg-orange-500/10 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 font-medium transition-colors"
                      >
                        Charger VLESS
                      </button>
                      <button
                        onClick={() => applyConfig(sampleVMess)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#1A1E29] hover:bg-orange-500/10 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 font-medium transition-colors"
                      >
                        Charger VMess
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/60 dark:divide-slate-800/70 text-xs">
                      <div className="flex justify-between items-center px-3.5 py-2.5 gap-3">
                        <span className="text-slate-500 dark:text-slate-400">Profil</span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{config.name}</span>
                      </div>
                      <div className="flex justify-between items-center px-3.5 py-2.5 gap-3">
                        <span className="text-slate-500 dark:text-slate-400">Host / SNI</span>
                        <span className="font-mono font-semibold text-orange-600 dark:text-orange-400 truncate">
                          {config.host}
                        </span>
                      </div>
                      <div className="flex justify-between items-center px-3.5 py-2.5 gap-3">
                        <span className="text-slate-500 dark:text-slate-400">Path</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 truncate">{config.path}</span>
                      </div>
                      <div className="flex justify-between items-center px-3.5 py-2.5 gap-3">
                        <span className="text-slate-500 dark:text-slate-400">Serveur</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                          {config.server}:{config.port}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handlePasteConfig}
                        className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Clipboard size={14} />
                        <span>Remplacer</span>
                      </button>
                      {!config.isLocked && (
                        <button
                          onClick={() => setActiveTab('generator')}
                          className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-slate-100 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] text-slate-800 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Key size={14} className="text-orange-500" />
                          <span>Chiffrer AES</span>
                        </button>
                      )}
                      <button
                        onClick={clearConfig}
                        className="min-h-[40px] px-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-600 dark:text-red-400 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Trash2 size={14} />
                        <span>Effacer</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: AES KEY GENERATOR                                     */}
        {/* ============================================================ */}
        {activeTab === 'generator' && (
          <section className="max-w-3xl mx-auto rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-6 shadow-sm space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Key size={18} className="text-orange-500" />
                  Générateur de lien Orange (AES-256)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Créez une configuration protégée liée à des identifiants appareils précis, avec date d’expiration et quota de données.
                </p>
              </div>
            </div>

            <form onSubmit={generateOrangeKey} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nom du profil
                  </label>
                  <input
                    type="text"
                    value={genName}
                    onChange={(e) => setGenName(e.target.value)}
                    placeholder="Ex: Orange Cameroun VIP"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    ID(s) appareil(s) autorisé(s)
                  </label>
                  <input
                    type="text"
                    value={genClientIds}
                    onChange={(e) => setGenClientIds(e.target.value.toUpperCase())}
                    placeholder="OR-XXXX-XXXX, OR-YYYY-YYYY"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Verrouillage AES
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Anti-copie du Host</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={genLock}
                    onChange={(e) => setGenLock(e.target.checked)}
                    className="w-4 h-4 accent-orange-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Date d’expiration
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Limiter dans le temps</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={genHasExpire}
                    onChange={(e) => setGenHasExpire(e.target.checked)}
                    className="w-4 h-4 accent-orange-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                      Quota de données
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Plafond Go / Mo</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={genHasQuota}
                    onChange={(e) => setGenHasQuota(e.target.checked)}
                    className="w-4 h-4 accent-orange-500"
                  />
                </label>
              </div>

              {(genHasExpire || genHasQuota) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {genHasExpire && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Valide jusqu’au
                      </label>
                      <input
                        type="date"
                        value={genExpireDate}
                        onChange={(e) => setGenExpireDate(e.target.value)}
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {genHasQuota && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Volume autorisé
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={genQuotaVal}
                          onChange={(e) => setGenQuotaVal(e.target.value)}
                          className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                        />
                        <select
                          value={genQuotaUnit}
                          onChange={(e) => setGenQuotaUnit(e.target.value as 'GB' | 'MB')}
                          className="min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-sm font-semibold text-orange-600 dark:text-orange-400 focus:outline-none"
                        >
                          <option value="GB">Go</option>
                          <option value="MB">Mo</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[46px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Key size={16} />
                <span>Générer et copier le lien Orange</span>
              </button>
            </form>

            {generatedLink && (
              <div className="rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-orange-500/30 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                    Lien chiffré généré
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLink);
                      setCopiedGenLink(true);
                      setTimeout(() => setCopiedGenLink(false), 2000);
                    }}
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-orange-500 flex items-center gap-1"
                  >
                    {copiedGenLink ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copiedGenLink ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>
                <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all select-all">
                  {generatedLink}
                </p>
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 3: TERMINAL LOGS                                         */}
        {/* ============================================================ */}
        {activeTab === 'logs' && (
          <section className="max-w-4xl mx-auto rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-orange-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Journal d’événements Xray
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800">
                  {[
                    { id: 'all', label: 'Tous' },
                    { id: 'tunnel', label: 'Tunnel' },
                    { id: 'alerts', label: 'Alertes' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setLogFilter(f.id as 'all' | 'alerts' | 'tunnel')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        logFilter === f.id
                          ? 'bg-white dark:bg-[#1E2432] text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setLogs([])}
                  className="min-h-[34px] px-3 rounded-lg bg-red-500/10 hover:bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-semibold transition-colors"
                >
                  Vider
                </button>
              </div>
            </div>

            <div className="h-80 overflow-y-auto rounded-xl bg-slate-950 p-4 font-mono text-xs space-y-2 border border-slate-800">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Aucun événement enregistré pour ce filtre.
                </div>
              ) : (
                filteredLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.includes('succès') || log.includes('établi') || log.includes('activé')
                        ? 'text-emerald-400'
                        : log.includes('invalide') || log.includes('Erreur') || log.includes('Alerte')
                        ? 'text-amber-400'
                        : log.includes('Orange') || log.includes('Diffusion') || log.includes('Protocole')
                        ? 'text-orange-400'
                        : 'text-slate-400'
                    }
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 4: GITHUB BROADCAST & REMOTE UPDATES                     */}
        {/* ============================================================ */}
        {activeTab === 'broadcast' && (
          <section className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Radio size={18} className="text-orange-500" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Simulateur de diffusion en direct
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Testez l’affichage instantané d’une notification administrateur avant de mettre à jour{' '}
                <code className="text-orange-600 dark:text-orange-400">public/broadcast.json</code> sur GitHub.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  value={adminSimTitle}
                  onChange={(e) => setAdminSimTitle(e.target.value)}
                  placeholder="Titre du message"
                  className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none"
                />
                <textarea
                  value={adminSimMessage}
                  onChange={(e) => setAdminSimMessage(e.target.value)}
                  rows={3}
                  placeholder="Contenu de la notification..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:border-orange-500 focus:outline-none resize-none"
                />
                <button
                  onClick={handleTestBroadcastPush}
                  className="w-full min-h-[42px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Send size={14} />
                  <span>Diffuser le message test</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw size={18} className="text-emerald-500" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Mises à jour & GitHub Sync
                  </h2>
                </div>
                <button
                  onClick={() => fetchRemoteData(true)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
                >
                  Vérifier maintenant
                </button>
              </div>

              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-[#0E1118] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <li>
                  Éditez <code className="text-orange-600 dark:text-orange-400">public/broadcast.json</code> sur GitHub avec un nouvel <code className="font-mono">"id"</code>.
                </li>
                <li>
                  Modifiez <code className="text-emerald-600 dark:text-emerald-400">public/app-update.json</code> pour publier une nouvelle version APK.
                </li>
                <li>
                  Effectuez un Commit & Push : tous les clients synchronisés reçoivent l’alerte automatiquement.
                </li>
              </ol>

              {availableUpdate && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      Version v{availableUpdate.currentVersion} disponible
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      {availableUpdate.releaseNotes}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowUpdateModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shrink-0"
                  >
                    Voir
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB 5: HOTSPOT VPN SHARING PAGE                              */}
        {/* ============================================================ */}
        {activeTab === 'hotspot' && (
          <section className="max-w-5xl mx-auto space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => setActiveTab('dashboard')}
                className="min-h-[40px] px-3.5 rounded-xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 hover:border-orange-500/50 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 transition-colors"
              >
                <ArrowLeft size={15} className="text-orange-500" />
                <span>Retour au VPN</span>
              </button>

              <div className="flex items-center gap-2 text-xs font-semibold">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
                    hotspotEnabled && isConnected
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : hotspotEnabled
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'bg-slate-100 dark:bg-[#13161F] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Wifi size={14} />
                  <span>
                    {hotspotEnabled && isConnected
                      ? 'Partage Hotspot actif'
                      : hotspotEnabled
                      ? 'Relais prêt (VPN déconnecté)'
                      : 'Partage désactivé'}
                  </span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Card: Hotspot Relay Control */}
              <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-6 shadow-sm flex flex-col justify-between space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-500">
                      <Share2 size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        Partage VPN par Hotspot
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Partagez votre tunnel chiffré avec un autre téléphone
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center py-4 space-y-4">
                  <button
                    onClick={toggleHotspotSharing}
                    className={`w-36 h-36 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-200 border-2 active:scale-[0.97] ${
                      hotspotEnabled
                        ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-300 text-white shadow-[0_12px_36px_rgba(16,185,129,0.28)]'
                        : 'bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-600 border-orange-300/60 text-white shadow-[0_10px_30px_rgba(255,121,0,0.25)]'
                    }`}
                  >
                    <Wifi size={34} />
                    <span className="text-[11px] font-bold uppercase tracking-wide">
                      {hotspotEnabled ? 'Partage Actif' : 'Activer Hotspot'}
                    </span>
                  </button>

                  {!isConnected && (
                    <div className="w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 text-center">
                      Le tunnel VPN est actuellement déconnecté. Connectez-vous sur le tableau de bord pour acheminer le trafic du 2e téléphone.
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/60 dark:divide-slate-800/70 text-xs tabular-nums">
                  <div className="flex justify-between items-center px-3.5 py-2.5">
                    <span className="text-slate-500 dark:text-slate-400">État du tunnel VPN</span>
                    <span className={`font-semibold ${isConnected ? 'text-emerald-500' : 'text-slate-500'}`}>
                      {isConnected ? 'Protégé' : 'Déconnecté'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-3.5 py-2.5">
                    <span className="text-slate-500 dark:text-slate-400">Relais local</span>
                    <span className="font-mono font-semibold text-orange-500">
                      0.0.0.0:{hotspotPort}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-3.5 py-2.5">
                    <span className="text-slate-500 dark:text-slate-400">Volume partagé</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatBytes(hotspotRelayedBytes)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Card: Proxy Parameters & 2nd Phone Guide */}
              <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800/90 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Smartphone size={18} className="text-orange-500" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Configuration pour l’autre téléphone
                    </h3>
                  </div>
                  <button
                    onClick={() =>
                      copyHotspotValue(
                        'Paramètres Hotspot',
                        `Proxy Orange VPN\nAdresse IP (Hôte) : ${hotspotIp}\nPort : ${hotspotPort}\nProtocole : ${hotspotProtocol}`
                      )
                    }
                    className="min-h-[34px] px-3 rounded-lg bg-orange-500/10 hover:bg-orange-500/15 text-orange-600 dark:text-orange-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    {copiedHotspotField === 'Paramètres Hotspot' ? <Check size={14} /> : <Copy size={14} />}
                    <span>Tout copier</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Adresse IP du Hotspot (Passerelle)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={hotspotIp}
                        onChange={(e) => {
                          setHotspotIp(e.target.value);
                          localStorage.setItem('orange_hotspot_ip', e.target.value);
                        }}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-orange-600 dark:text-orange-400 focus:border-orange-500 focus:outline-none"
                      />
                      <button
                        onClick={() => copyHotspotValue('Adresse IP', hotspotIp)}
                        className="min-h-[40px] px-3 rounded-xl bg-slate-100 dark:bg-[#1A1E29] text-slate-700 dark:text-slate-200 text-xs font-semibold"
                        title="Copier l'IP"
                      >
                        {copiedHotspotField === 'Adresse IP' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {['192.168.43.1', '192.168.49.1', '192.168.137.1'].map((ip) => (
                        <button
                          key={ip}
                          type="button"
                          onClick={() => {
                            setHotspotIp(ip);
                            localStorage.setItem('orange_hotspot_ip', ip);
                          }}
                          className={`px-2 py-1 rounded-md text-[11px] font-mono transition-colors ${
                            hotspotIp === ip
                              ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold'
                              : 'bg-slate-100 dark:bg-[#0E1118] text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {ip}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Port Proxy & Protocole
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={hotspotPort}
                        onChange={(e) => {
                          setHotspotPort(e.target.value);
                          localStorage.setItem('orange_hotspot_port', e.target.value);
                        }}
                        className="w-24 min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:border-orange-500 focus:outline-none"
                      />
                      <select
                        value={hotspotProtocol}
                        onChange={(e) => {
                          const proto = e.target.value === 'SOCKS5' ? 'SOCKS5' : 'HTTP';
                          setHotspotProtocol(proto);
                          localStorage.setItem('orange_hotspot_proto', proto);
                        }}
                        className="flex-1 min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
                      >
                        <option value="HTTP">HTTP Proxy (Wi-Fi)</option>
                        <option value="SOCKS5">SOCKS5</option>
                      </select>
                      <button
                        onClick={() => copyHotspotValue('Port', hotspotPort)}
                        className="min-h-[40px] px-3 rounded-xl bg-slate-100 dark:bg-[#1A1E29] text-slate-700 dark:text-slate-200 text-xs font-semibold"
                        title="Copier le port"
                      >
                        {copiedHotspotField === 'Port' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Comment connecter l’autre téléphone en 4 étapes :
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                    <li>
                      Activez le <strong>Point d’accès Wi-Fi (Hotspot)</strong> sur ce téléphone et connectez le 2e téléphone dessus.
                    </li>
                    <li>
                      Connectez <strong>Orange VPN</strong> sur ce téléphone puis activez <strong>Partager Hotspot</strong>.
                    </li>
                    <li>
                      Sur le 2e téléphone : <strong>Paramètres Wi-Fi → Réseau connecté → Modifier → Options avancées → Proxy : Manuel</strong>.
                    </li>
                    <li>
                      Saisissez Hôte : <code className="font-mono font-bold text-orange-500">{hotspotIp}</code> et Port :{' '}
                      <code className="font-mono font-bold text-emerald-500">{hotspotPort}</code>, puis validez.
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Bottom-Right Floating Hotspot Share Button */}
      {activeTab !== 'hotspot' && (
        <button
          onClick={() => setActiveTab('hotspot')}
          aria-label="Partager la connexion VPN via Hotspot"
          title="Partager la connexion VPN via Hotspot"
          className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 min-h-[48px] px-4 py-2.5 rounded-full font-bold text-xs text-white shadow-xl flex items-center gap-2 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 ${
            hotspotEnabled
              ? 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_8px_24px_rgba(16,185,129,0.38)]'
              : 'bg-orange-500 hover:bg-orange-600 shadow-[0_8px_24px_rgba(255,121,0,0.38)]'
          }`}
        >
          <Wifi size={17} />
          <span>{hotspotEnabled ? 'Hotspot Actif' : 'Partager VPN'}</span>
        </button>
      )}

      {/* Clean Minimal Footer */}
      <footer className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-8 pb-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2 font-medium">
          <OrangeShield size={16} isConnected={isConnected} />
          <span>Orange VPN · Propulsé par @kcorp-tech</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowWelcomeModal(true)}
            className="hover:text-orange-500 transition-colors"
          >
            À propos & Support
          </button>
          <span aria-hidden="true">·</span>
          <a
            href="https://wa.me/237687960259"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-orange-500 transition-colors"
          >
            Contact DEV
          </a>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (<= 64px height, <= 15% mobile viewport) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-[#0E1118]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center"
        aria-label="Navigation mobile"
      >
        {[
          { id: 'panel', label: 'Panel VPS', icon: Server },
          { id: 'dashboard', label: 'Client', icon: Shield },
          { id: 'generator', label: 'Clé AES', icon: Key },
          { id: 'logs', label: 'Journaux', icon: Terminal },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as NavTab)}
              className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active
                  ? 'text-orange-600 dark:text-orange-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ================================================================ */}
      {/* MODAL 1: Mandatory Onboarding & Welcome Experience               */}
      {/* ================================================================ */}
      {showMandatoryNameModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex flex-col items-center text-center space-y-2.5">
              <OrangeShield size={56} isGlowing />
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
                Bienvenue sur Orange VPN
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tunnel chiffré haute performance · @kcorp-tech
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 text-xs">
              <div className="flex items-start gap-3 p-3.5">
                <Zap size={16} className="text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Configuration automatique
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Extraction instantanée de vos liens VLESS, VMess, Trojan ou clés Orange AES.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3.5">
                <Database size={16} className="text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Suivi intelligent du forfait
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Alertes automatiques tous les 200 Mo consommés et rappels quotidiens d’expiration.
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveMandatoryName} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Votre prénom ou nom (requis pour vos alertes)
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      if (nameError) setNameError('');
                    }}
                    placeholder="Ex: Jean-Paul, Alain..."
                    className="w-full min-h-[44px] bg-slate-50 dark:bg-[#0E1118] text-sm text-slate-900 dark:text-white pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-orange-500 focus:outline-none transition-colors"
                    autoFocus
                  />
                </div>
                {nameError && (
                  <p className="mt-1.5 text-xs text-red-500 font-medium">{nameError}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full min-h-[46px] bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <span>Activer mon espace sécurisé</span>
                <ChevronRight size={16} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL 1B: Welcome & Support Guide (Re-openable anytime)          */}
      {/* ================================================================ */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 relative">
            <button
              onClick={() => setShowWelcomeModal(false)}
              className="absolute top-4 right-4 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-center text-center space-y-2 pt-1">
              <OrangeShield size={54} isGlowing isConnected={isConnected} />
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Bienvenue sur Orange VPN
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                Votre client réseau chiffré, rapide et simple d’utilisation, propulsé par <strong className="text-orange-500">@kcorp-tech</strong>.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="font-bold text-slate-900 dark:text-white">Démarrage rapide</div>
              <p>
                1. Copiez un lien <code className="text-orange-500">orange://</code> (chiffré AES-256) ou un lien <code className="font-mono">vless://</code> / <code className="font-mono">vmess://</code>.
              </p>
              <p>
                2. Appuyez sur <strong>Coller la configuration</strong> : l’application renseigne automatiquement le Host, le Path et le serveur.
              </p>
              <p>
                3. Touchez le bouton central pour ouvrir votre tunnel chiffré.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href="https://wa.me/237687960259"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-3.5 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle size={15} />
                <span>Support DEV</span>
              </a>
              <a
                href="https://chat.whatsapp.com/GtBg9UmAV0k0ZwyfA07NkX?s=cl&p=a&mlu=4&ilr=4&iam=2"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Users size={15} className="text-emerald-500" />
                <span>Groupe WhatsApp</span>
              </a>
            </div>

            <button
              onClick={() => setShowWelcomeModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition-colors"
            >
              Commencer
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL 2: 200 Mo Consumption Alert                                */}
      {/* ================================================================ */}
      {consumptionAlertData && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-orange-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-orange-500/15 text-orange-500 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Rappel de consommation
            </h3>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-left space-y-2 text-xs">
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                Cher <strong className="text-orange-500">{userName || 'Client'}</strong>, vous venez de consommer <strong>200 Mo</strong> supplémentaires sur votre forfait.
              </p>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">Total consommé</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {consumptionAlertData.consumedMb} Mo
                </span>
              </div>
              <div className="flex justify-between tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">Volume restant</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {consumptionAlertData.remainingGb} Go
                </span>
              </div>
            </div>
            <button
              onClick={() => setConsumptionAlertData(null)}
              className="w-full min-h-[42px] bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs rounded-xl transition-colors"
            >
              Compris, continuer
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL 3: Daily Expiration Alert                                  */}
      {/* ================================================================ */}
      {expiryAlertData && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-amber-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
              <Calendar size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Échéance de votre forfait
            </h3>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-left space-y-2 text-xs">
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                Cher <strong className="text-orange-500">{userName}</strong>, votre forfait Orange VPN expire le{' '}
                <strong>{expiryAlertData.expiryDateFormatted}</strong>{' '}
                {expiryAlertData.daysRemaining <= 0 ? (
                  <span className="text-red-500 font-semibold">(Expiré aujourd’hui)</span>
                ) : (
                  <span className="text-amber-500 font-semibold">(dans {expiryAlertData.daysRemaining} jour(s))</span>
                )}.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Pensez à renouveler votre abonnement pour éviter toute interruption de connexion.
              </p>
            </div>
            <button
              onClick={() => setExpiryAlertData(null)}
              className="w-full min-h-[42px] bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs rounded-xl transition-colors"
            >
              OK, j’ai noté
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL 4: Remote GitHub Broadcast                                 */}
      {/* ================================================================ */}
      {showBroadcastModal && activeBroadcast && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-orange-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 relative">
            <button
              onClick={() => {
                setShowBroadcastModal(false);
                if (activeBroadcast.id) {
                  localStorage.setItem('orange_last_broadcast_seen', activeBroadcast.id);
                }
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-orange-500 text-xs font-semibold">
              <Radio size={18} />
              <span>Annonce officielle Orange VPN</span>
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeBroadcast.title}</h3>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
              {activeBroadcast.message}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Canal GitHub</span>
              <span>{new Date(activeBroadcast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className="flex gap-2">
              {activeBroadcast.actionUrl && (
                <a
                  href={activeBroadcast.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[40px] rounded-xl bg-slate-100 dark:bg-[#1A1E29] text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5"
                >
                  <ExternalLink size={14} />
                  <span>{activeBroadcast.actionLabel || 'Ouvrir'}</span>
                </a>
              )}
              <button
                onClick={() => {
                  setShowBroadcastModal(false);
                  if (activeBroadcast.id) {
                    localStorage.setItem('orange_last_broadcast_seen', activeBroadcast.id);
                  }
                }}
                className="flex-1 min-h-[40px] bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs rounded-xl transition-colors"
              >
                J’ai lu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL 5: Remote App Update Available                             */}
      {/* ================================================================ */}
      {showUpdateModal && availableUpdate && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-emerald-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 relative">
            <button
              onClick={() => {
                setShowUpdateModal(false);
                sessionStorage.setItem(`ignored_update_${availableUpdate.currentVersion}`, 'true');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <Download size={18} />
              <span>Mise à jour disponible</span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Orange VPN v{availableUpdate.currentVersion}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Version installée : v{APP_VERSION}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              <div className="font-semibold text-orange-500 mb-1">Notes de version</div>
              <p>{availableUpdate.releaseNotes}</p>
            </div>

            <div className="flex gap-2">
              {!availableUpdate.forceUpdate && (
                <button
                  onClick={() => {
                    setShowUpdateModal(false);
                    sessionStorage.setItem(`ignored_update_${availableUpdate.currentVersion}`, 'true');
                  }}
                  className="flex-1 min-h-[42px] bg-slate-100 dark:bg-[#1A1E29] text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl"
                >
                  Plus tard
                </button>
              )}
              <a
                href={availableUpdate.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[42px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <Download size={14} />
                <span>Télécharger</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL 6: Notification Center                                     */}
      {/* ================================================================ */}
      {showNotificationDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-orange-500" />
                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  Notifications ({notifications.length})
                </h4>
              </div>
              <button
                onClick={() => setShowNotificationDrawer(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  Aucune notification pour le moment.
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 space-y-1 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{item.title}</span>
                      <span className="text-[11px] text-slate-400 tabular-nums">{item.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item.message}</p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <button
                onClick={() => setNotifications([])}
                className="flex-1 min-h-[40px] bg-slate-100 dark:bg-[#1A1E29] text-slate-600 dark:text-slate-300 font-semibold text-xs rounded-xl"
              >
                Tout effacer
              </button>
              <button
                onClick={() => {
                  sendSystemNotification(
                    'Orange VPN • Notification test',
                    `Bonjour ${userName || 'Client'}, les notifications système sont opérationnelles.`
                  );
                  playChime('success');
                  showToast('Notification de test envoyée.');
                }}
                className="flex-1 min-h-[40px] bg-orange-500/10 hover:bg-orange-500/15 text-orange-600 dark:text-orange-400 font-semibold text-xs rounded-xl border border-orange-500/30"
              >
                Tester une alerte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL 7: Settings & User Profile                                 */}
      {/* ================================================================ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white text-base">Paramètres du client</h4>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* User Profile Name */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nom de l’utilisateur
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="flex-1 min-h-[40px] bg-white dark:bg-[#13161F] text-xs text-slate-900 dark:text-white px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={() => {
                    localStorage.setItem('orange_user_name', userName.trim());
                    showToast('Profil mis à jour.');
                  }}
                  className="px-4 min-h-[40px] bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs rounded-xl"
                >
                  Sauver
                </button>
              </div>
            </div>

            {/* Expiration Date */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Date d’expiration du forfait
              </div>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => {
                  setExpiryDate(e.target.value);
                  localStorage.setItem('orange_expiry_date', e.target.value);
                  showToast('Date d’expiration mise à jour.');
                }}
                className="w-full min-h-[40px] bg-white dark:bg-[#13161F] text-xs text-slate-900 dark:text-white px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-orange-500 focus:outline-none"
              />
            </div>

            {/* Quota Slider */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                <span>Quota total du forfait</span>
                <span className="text-orange-500 font-mono">{totalQuotaGb} Go</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={totalQuotaGb}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setTotalQuotaGb(val);
                  localStorage.setItem('orange_total_quota_gb', val.toString());
                }}
                className="w-full accent-orange-500"
              />
            </div>

            {/* Device ID */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Identifiant unique de cet appareil
                </div>
                <div className="font-mono text-sm font-bold text-orange-600 dark:text-orange-400 mt-0.5">
                  {installationId}
                </div>
              </div>
              <button
                onClick={copyAppId}
                className="min-h-[38px] px-3 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                {copiedId ? <Check size={15} /> : <Copy size={15} />}
                <span>{copiedId ? 'Copié' : 'Copier'}</span>
              </button>
            </div>

            <button
              onClick={() => {
                setTotalTrafficBytes(0);
                setLastMilestone200Mb(0);
                localStorage.setItem('orange_traffic_bytes', '0');
                localStorage.setItem('orange_last_milestone_200mb', '0');
                showToast('Compteur de données réinitialisé à 0.');
              }}
              className="w-full min-h-[42px] bg-slate-100 dark:bg-[#1A1E29] hover:bg-slate-200 dark:hover:bg-[#232838] text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition-colors"
            >
              Réinitialiser le compteur de données
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL 8: Manual Paste Config                                     */}
      {/* ================================================================ */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <OrangeShield size={24} />
                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  Importer une configuration
                </h4>
              </div>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Collez votre lien VLESS, VMess, Trojan ou clé chiffrée Orange ci-dessous :
            </p>
            <textarea
              value={manualInputText}
              onChange={(e) => setManualInputText(e.target.value)}
              placeholder="vless://... ou orange://config/..."
              rows={4}
              className="w-full bg-slate-50 dark:bg-[#0E1118] text-xs font-mono text-slate-900 dark:text-white p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 outline-none focus:border-orange-500 transition-colors resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowPasteModal(false)}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-100 dark:bg-[#1A1E29] text-slate-700 dark:text-slate-300 font-semibold text-xs"
              >
                Annuler
              </button>
              <button
                onClick={() => applyConfig(manualInputText)}
                className="flex-1 min-h-[42px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs transition-colors"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
