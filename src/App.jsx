import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  TriangleAlert,
  LogOut,
  Building2,
  Lock,
  Upload,
  Download,
  Printer,
  ArrowUpDown,
  ScanLine,
  Barcode,
  HelpCircle,
  Search,
  Save,
  RotateCcw,
} from "lucide-react";
import Papa from "papaparse";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "./supabaseClient.js";
import { loadAppData, saveAppData } from "./supabaseData.js";
import BarcodeScanner from "./BarcodeScanner.jsx";
import { TOKENS } from "./tokens.js";

const statusColor = (pct) => {
  if (pct >= 98) return TOKENS.good;
  if (pct >= 90) return TOKENS.warn;
  return TOKENS.bad;
};

function translateAuthError(error) {
  const msg = error?.message || "";
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("User already registered")) return "Já existe uma conta com esse e-mail.";
  if (msg.includes("Password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("Email not confirmed"))
    return "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada e o spam).";
  if (msg.includes("rate limit")) return "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.";
  return msg || "Não foi possível completar a ação. Tente novamente.";
}

function slugifyName(str) {
  return (str || "workspace")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "workspace";
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100" height="100" rx="22" fill="#1B2126" stroke="#2A3339" strokeWidth="2" />
      <g stroke="#14181C" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M58,32 L76,40 L58,48 L40,40 Z" fill="#EDEDE5" fillOpacity="0.92" />
        <path d="M40,40 L58,48 L58,72 L40,64 Z" fill="#EDEDE5" fillOpacity="0.55" />
        <path d="M76,40 L58,48 L58,72 L76,64 Z" fill="#EDEDE5" fillOpacity="0.72" />
      </g>
      <line x1="18" y1="48" x2="90" y2="48" stroke="#F2A900" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M86,43 L94,48 L86,53 Z" fill="#F2A900" />
      <circle cx="88" cy="84" r="15" fill="#4CAF7D" stroke="#1B2126" strokeWidth="3" />
      <path d="M80,84 L86,90 L97,76" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function inputStyle() {
  return {
    background: TOKENS.bg,
    border: `1px solid ${TOKENS.panelBorder}`,
    color: TOKENS.textPrimary,
  };
}

function toolbarBtnStyle() {
  return {
    color: TOKENS.textSecondary,
    border: `1px solid ${TOKENS.panelBorder}`,
    background: TOKENS.bg,
  };
}

export default function AcuraStock() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [authMode, setAuthMode] = useState("login"); // 'login' | 'signup' | 'forgot'
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [sortMode, setSortMode] = useState("worst"); // 'worst' | 'order'

  const [name, setName] = useState("");
  const [barcodeField, setBarcodeField] = useState("");
  const [expected, setExpected] = useState("");
  const [counted, setCounted] = useState("");
  const [unitCost, setUnitCost] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [scanNotice, setScanNotice] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(200);
  const PAGE_SIZE = 200;

  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const historyRef = useRef(history);
  historyRef.current = history;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const feedbackTimerRef = useRef(null);

  const companyName = session?.user?.user_metadata?.company_name || session?.user?.email || "";
  const fileSlug = slugifyName(companyName);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin() {
    setAuthError("");
    setAuthMessage("");
    if (!email.trim() || !password) {
      setAuthError("Preencha e-mail e senha.");
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setAuthError(translateAuthError(error));
    setAuthBusy(false);
  }

  async function handleSignup() {
    setAuthError("");
    setAuthMessage("");
    if (!companyName.trim() || !email.trim() || !password) {
      setAuthError("Preencha empresa, e-mail e senha.");
      return;
    }
    if (password.length < 6) {
      setAuthError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setAuthBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { company_name: companyName.trim() } },
    });
    if (error) {
      setAuthError(translateAuthError(error));
    } else if (data.user && !data.session) {
      setAuthMessage("Conta criada! Verifique seu e-mail (e a caixa de spam) para confirmar antes de entrar.");
      setAuthMode("login");
    }
    setAuthBusy(false);
  }

  async function handleForgotPassword() {
    setAuthError("");
    setAuthMessage("");
    if (!email.trim()) {
      setAuthError("Digite seu e-mail.");
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) setAuthError(translateAuthError(error));
    else setAuthMessage("Se esse e-mail estiver cadastrado, enviamos um link de redefinição de senha.");
    setAuthBusy(false);
  }

  function handleAuthKeyDown(e) {
    if (e.key !== "Enter") return;
    if (authMode === "signup") handleSignup();
    else if (authMode === "forgot") handleForgotPassword();
    else handleLogin();
  }

  async function logout() {
    await supabase.auth.signOut();
    setItems([]);
    setHistory([]);
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadingData(true);
    (async () => {
      try {
        const data = await loadAppData(session.user.id);
        if (!cancelled) {
          setItems(data.items);
          setHistory(data.history);
        }
      } catch (e) {
        if (!cancelled) {
          setItems([]);
          setHistory([]);
          setSaveError("Não foi possível carregar seus dados agora.");
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function persistAll(nextItems, nextHistory) {
    const sess = sessionRef.current;
    if (!sess) return;
    setSaveError("");
    try {
      await saveAppData(sess.user.id, { items: nextItems, history: nextHistory });
    } catch (e) {
      setSaveError("Não foi possível salvar. Tente novamente.");
    }
  }

  function addItem() {
    const exp = parseFloat(expected);
    const cnt = parseFloat(counted);
    if (!name.trim() || isNaN(exp) || isNaN(cnt) || exp < 0 || cnt < 0) return;
    const cost = parseFloat(unitCost.replace(",", "."));
    const validCost = !isNaN(cost) && cost > 0 ? cost : 0;
    const next = [
      ...items,
      {
        id: Date.now() + Math.random(),
        name: name.trim(),
        expected: exp,
        counted: cnt,
        barcode: barcodeField.trim() || null,
        unitCost: validCost,
      },
    ];
    setItems(next);
    persistAll(next, historyRef.current);

    setName("");
    setBarcodeField("");
    setExpected("");
    setCounted("");
    setUnitCost("");
    setScanNotice("");
  }

  function removeItem(id) {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    persistAll(next, historyRef.current);
  }

  function updateItemField(id, field, rawValue) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (field === "name") return { ...it, name: rawValue };
        const num = parseFloat(rawValue);
        return { ...it, [field]: isNaN(num) ? 0 : Math.max(0, num) };
      })
    );
  }

  function handleFieldBlur() {
    persistAll(itemsRef.current, historyRef.current);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") addItem();
  }

  const handleScan = useCallback((code) => {
    const current = itemsRef.current;
    const idx = current.findIndex((it) => it.barcode && it.barcode === code);

    if (idx >= 0) {
      const next = current.map((it, i) =>
        i === idx ? { ...it, counted: it.counted + 1 } : it
      );
      setItems(next);
      persistAll(next, historyRef.current);
      setScanFeedback({
        type: "ok",
        text: `${current[idx].name}: contado agora ${next[idx].counted}`,
      });
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setScanFeedback(null), 1800);
    } else {
      setScannerOpen(false);
      setBarcodeField(code);
      setScanNotice(`Código ${code} não cadastrado — preencha o nome do item abaixo e adicione.`);
    }
  }, []);

  function triggerImport() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const parsed = Papa.parse(text.trim(), { skipEmptyLines: true });
      let rowsIn = parsed.data;
      if (rowsIn.length === 0) return;
      const first = rowsIn[0];
      const looksLikeHeader = isNaN(parseFloat(first[1])) || isNaN(parseFloat(first[2]));
      if (looksLikeHeader) rowsIn = rowsIn.slice(1);
      const imported = rowsIn
        .map((r) => {
          const itemName = (r[0] || "").toString().trim();
          const exp = parseFloat(r[1]);
          const cnt = parseFloat(r[2]);
          const barcode = (r[3] || "").toString().trim() || null;
          const cost = parseFloat((r[4] || "").toString().replace(",", "."));
          const validCost = !isNaN(cost) && cost > 0 ? cost : 0;
          if (!itemName || isNaN(exp) || isNaN(cnt)) return null;
          return {
            id: Date.now() + Math.random(),
            name: itemName,
            expected: Math.max(0, exp),
            counted: Math.max(0, cnt),
            barcode,
            unitCost: validCost,
          };
        })
        .filter(Boolean);
      if (imported.length === 0) {
        setSaveError("Não encontrei linhas válidas no CSV (esperado: item, sistema, contado).");
        return;
      }
      const next = [...items, ...imported];
      setItems(next);
      persistAll(next, historyRef.current);
      setSaveError("");
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  function exportCSV() {
    const header = ["Item", "Sistema", "Contado", "Divergencia", "Acuracia(%)", "CodigoBarras", "CustoUnitario"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const safeName = r.name.includes(",") ? `"${r.name}"` : r.name;
      lines.push(
        [safeName, r.expected, r.counted, r.diff, r.pct.toFixed(1), r.barcode || "", r.unitCost || ""].join(",")
      );
    });
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acurastock-${fileSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const dateStr = new Date().toLocaleDateString("pt-BR");
    const rowsHtml = rows
      .map(
        (r) => `
        <tr>
          <td>${r.name}</td>
          <td style="text-align:right">${r.expected}</td>
          <td style="text-align:right">${r.counted}</td>
          <td style="text-align:right; color:${r.diff === 0 ? "#555" : "#B3261E"}">${r.diff > 0 ? "+" + r.diff : r.diff}</td>
          <td style="text-align:right; font-weight:600; color:${
            r.pct >= 98 ? "#1E7A4C" : r.pct >= 90 ? "#946A00" : "#B3261E"
          }">${r.pct.toFixed(0)}%</td>
        </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>AcuraStock - Relatorio ${companyName}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 40px; }
  h1 { margin-bottom: 0; }
  .sub { color: #666; margin-top: 4px; margin-bottom: 24px; font-size: 14px; }
  .summary { display: flex; gap: 32px; margin-bottom: 28px; }
  .summary div { }
  .summary .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #777; }
  .summary .value { font-size: 24px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; border-bottom: 2px solid #222; padding: 8px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #444; }
  td { padding: 7px 6px; border-bottom: 1px solid #ddd; }
  @media print {
    body { margin: 15mm; }
  }
</style>
</head>
<body>
  <h1>AcuraStock</h1>
  <p class="sub">Empresa: <strong>${companyName}</strong> &middot; Relatório gerado em ${dateStr}</p>

  <div class="summary">
    <div>
      <div class="label">Acurácia por quantidade</div>
      <div class="value">${totals.byQty.toFixed(1)}%</div>
    </div>
    <div>
      <div class="label">Acurácia por SKU</div>
      <div class="value">${totals.bySku.toFixed(1)}%</div>
    </div>
    <div>
      <div class="label">Itens corretos</div>
      <div class="value">${totals.skuOk}/${rows.length}</div>
    </div>
    <div>
      <div class="label">Divergência total</div>
      <div class="value">${totals.totalAbsDiff}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Item</th><th style="text-align:right">Sistema</th><th style="text-align:right">Contado</th><th style="text-align:right">Diverg.</th><th style="text-align:right">Acurácia</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <p style="margin-top:24px; font-size:11px; color:#888;">Para salvar como PDF: pressione Ctrl+P (ou Cmd+P no Mac) e escolha "Salvar como PDF".</p>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acurastock-relatorio-${fileSlug}-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    const backup = {
      app: "acurastock",
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: { name: companyName },
      items,
      history,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acurastock-backup-${fileSlug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function triggerRestoreBackup() {
    backupInputRef.current?.click();
  }

  function handleRestoreBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!Array.isArray(data.items)) {
          setSaveError("Arquivo de backup inválido: não encontrei a lista de itens.");
          return;
        }
        const confirmed = window.confirm(
          `Isso vai SUBSTITUIR todos os itens e o histórico atuais desta conta pelos dados do backup (de ${
            data.exportedAt ? new Date(data.exportedAt).toLocaleString("pt-BR") : "data desconhecida"
          }). Essa ação não pode ser desfeita. Continuar?`
        );
        if (!confirmed) return;

        const restoredItems = data.items;
        const restoredHistory = Array.isArray(data.history) ? data.history : [];
        setItems(restoredItems);
        setHistory(restoredHistory);
        persistAll(restoredItems, restoredHistory);
        setSaveError("");
      } catch (err) {
        setSaveError("Não foi possível ler esse arquivo de backup (JSON inválido).");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  function closeCount() {
    if (rows.length === 0) return;
    const snapshot = {
      date: Date.now(),
      byQty: Number(totals.byQty.toFixed(1)),
      bySku: Number(totals.bySku.toFixed(1)),
      count: rows.length,
    };
    const next = [...history, snapshot];
    setHistory(next);
    persistAll(itemsRef.current, next);
  }

  const rowsUnsorted = useMemo(() => {
    return items.map((it) => {
      const diff = it.counted - it.expected;
      const pct =
        it.expected === 0
          ? it.counted === 0
            ? 100
            : 0
          : Math.max(0, 100 - (Math.abs(diff) / it.expected) * 100);
      return { ...it, diff, pct };
    });
  }, [items]);

  const rows = useMemo(() => {
    if (sortMode === "worst") {
      return [...rowsUnsorted].sort((a, b) => a.pct - b.pct);
    }
    return rowsUnsorted;
  }, [rowsUnsorted, sortMode]);

  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.barcode || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const visibleRows = useMemo(() => {
    return searchedRows.slice(0, visibleCount);
  }, [searchedRows, visibleCount]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, sortMode]);

  const totals = useMemo(() => {
    if (rowsUnsorted.length === 0) {
      return { byQty: 0, bySku: 0, totalAbsDiff: 0, skuOk: 0 };
    }
    const totalExpected = rowsUnsorted.reduce((s, r) => s + r.expected, 0);
    const totalAbsDiff = rowsUnsorted.reduce((s, r) => s + Math.abs(r.diff), 0);
    const skuOk = rowsUnsorted.filter((r) => r.diff === 0).length;
    const byQty =
      totalExpected === 0 ? 0 : Math.max(0, 100 - (totalAbsDiff / totalExpected) * 100);
    const bySku = (skuOk / rowsUnsorted.length) * 100;
    return { byQty, bySku, totalAbsDiff, skuOk };
  }, [rowsUnsorted]);

  const readoutColor = rows.length ? statusColor(totals.byQty) : TOKENS.amberDim;

  const stockValue = useMemo(() => {
    return items.reduce((s, it) => s + (it.unitCost || 0) * it.expected, 0);
  }, [items]);

  const fontStyle = { fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" };
  const fontLoader = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
      .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      input::placeholder { color: #5B6672; }
      .cell-input { background: transparent; border: none; outline: none; width: 100%; text-align: right; }
      .cell-input:focus { outline: 1px solid ${TOKENS.amberDim}; border-radius: 3px; }
      .name-input { background: transparent; border: none; outline: none; width: 100%; }
      .name-input:focus { outline: 1px solid ${TOKENS.amberDim}; border-radius: 3px; }
      @media print {
        .no-print { display: none !important; }
        body, .print-bg { background: #ffffff !important; }
        .print-text { color: #111111 !important; }
      }
    `}</style>
  );

  if (sessionLoading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ background: TOKENS.bg }}>
        <p className="text-sm" style={{ color: TOKENS.textSecondary }}>Carregando...</p>
      </div>
    );
  }

  if (!session) {
    const title =
      authMode === "signup" ? "Crie sua conta" : authMode === "forgot" ? "Recuperar senha" : "Entre na sua conta";
    const submitHandler =
      authMode === "signup" ? handleSignup : authMode === "forgot" ? handleForgotPassword : handleLogin;
    const submitLabel =
      authMode === "signup" ? "Criar conta" : authMode === "forgot" ? "Enviar link de redefinição" : "Entrar";

    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4" style={{ background: TOKENS.bg, ...fontStyle }}>
        {fontLoader}
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <Logo size={56} />
            <h1 className="mono text-xl font-bold mt-4" style={{ color: TOKENS.textPrimary }}>
              Acura<span style={{ color: TOKENS.amber }}>Stock</span>
            </h1>
            <p className="text-xs mt-1 text-center" style={{ color: TOKENS.textSecondary }}>{title}</p>
          </div>

          <div className="rounded-lg p-5" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
            {authMode === "signup" && (
              <>
                <label className="text-xs uppercase tracking-widest mb-1 flex items-center gap-1.5" style={{ color: TOKENS.textSecondary }}>
                  <Building2 size={12} /> Nome da empresa
                </label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={handleAuthKeyDown}
                  placeholder="Ex: Distribuidora Aurora"
                  className="mono w-full px-3 py-2 rounded text-sm outline-none mb-4"
                  style={inputStyle()}
                />
              </>
            )}

            <label className="text-xs uppercase tracking-widest mb-1 flex items-center gap-1.5" style={{ color: TOKENS.textSecondary }}>
              E-mail
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleAuthKeyDown}
              placeholder="voce@empresa.com"
              type="email"
              className="mono w-full px-3 py-2 rounded text-sm outline-none mb-4"
              style={inputStyle()}
            />

            {authMode !== "forgot" && (
              <>
                <label className="text-xs uppercase tracking-widest mb-1 flex items-center gap-1.5" style={{ color: TOKENS.textSecondary }}>
                  <Lock size={12} /> Senha
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleAuthKeyDown}
                  placeholder={authMode === "signup" ? "Mínimo 6 caracteres" : "Sua senha"}
                  type="password"
                  className="mono w-full px-3 py-2 rounded text-sm outline-none mb-1"
                  style={inputStyle()}
                />
              </>
            )}

            {authError && (
              <p className="text-xs mt-2 mb-1 flex items-center gap-1.5" style={{ color: TOKENS.bad }}>
                <TriangleAlert size={12} /> {authError}
              </p>
            )}
            {authMessage && (
              <p className="text-xs mt-2 mb-1" style={{ color: TOKENS.good }}>
                {authMessage}
              </p>
            )}

            <button
              onClick={submitHandler}
              disabled={authBusy}
              className="w-full py-2 rounded text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 mt-3"
              style={{ background: TOKENS.amber, color: "#1A1400" }}
            >
              {authBusy ? "Aguarde..." : submitLabel}
            </button>

            <div className="flex justify-between mt-4 text-xs">
              {authMode === "login" ? (
                <>
                  <button
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError("");
                      setAuthMessage("");
                    }}
                    style={{ color: TOKENS.textSecondary }}
                  >
                    Criar conta
                  </button>
                  <button
                    onClick={() => {
                      setAuthMode("forgot");
                      setAuthError("");
                      setAuthMessage("");
                    }}
                    style={{ color: TOKENS.textSecondary }}
                  >
                    Esqueci minha senha
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                    setAuthMessage("");
                  }}
                  style={{ color: TOKENS.textSecondary }}
                >
                  ← Voltar para login
                </button>
              )}
            </div>
          </div>

          <p className="text-[11px] mt-4 text-center leading-relaxed" style={{ color: TOKENS.textSecondary }}>
            Login com autenticação real (Supabase) — sua senha nunca fica salva em texto puro, e seus dados ficam isolados dos de outras empresas no próprio banco de dados.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex justify-center px-4 py-10 print-bg" style={{ background: TOKENS.bg, ...fontStyle }}>
      {fontLoader}

      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <h1 className="mono text-lg font-bold tracking-wide print-text" style={{ color: TOKENS.textPrimary }}>
                Acura<span style={{ color: TOKENS.amber }}>Stock</span>
              </h1>
              <p className="text-xs print-text" style={{ color: TOKENS.textSecondary }}>
                Empresa: <span className="mono">{companyName}</span> · Relatório de {new Date().toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="no-print flex items-center gap-1.5 text-xs px-3 py-1.5 rounded hover:opacity-80"
            style={{ color: TOKENS.textSecondary, border: `1px solid ${TOKENS.panelBorder}` }}
          >
            <LogOut size={13} /> Sair
          </button>
        </div>

        <div
          className="rounded-lg p-6 mb-6 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6"
          style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-1 relative">
              <span className="text-xs uppercase tracking-widest" style={{ color: TOKENS.textSecondary }}>
                Acurácia por quantidade
              </span>
              <button
                onClick={() => setShowHelp((v) => !v)}
                onBlur={() => setShowHelp(false)}
                style={{ color: TOKENS.textSecondary }}
                aria-label="O que significa acurácia por quantidade"
              >
                <HelpCircle size={13} />
              </button>
              {showHelp && (
                <div
                  className="absolute left-0 top-6 z-10 w-64 text-xs leading-relaxed p-3 rounded-lg no-print"
                  style={{ background: TOKENS.bg, border: `1px solid ${TOKENS.panelBorder}`, color: TOKENS.textSecondary }}
                >
                  <p className="mb-1.5">
                    <strong style={{ color: TOKENS.textPrimary }}>Por quantidade:</strong> 1 − (soma das divergências absolutas ÷ total esperado).
                  </p>
                  <p>
                    <strong style={{ color: TOKENS.textPrimary }}>Por SKU:</strong> % de itens sem nenhuma divergência.
                  </p>
                </div>
              )}
            </div>
            <div
              className="mono text-6xl font-semibold leading-none"
              style={{ color: readoutColor, textShadow: rows.length ? `0 0 24px ${readoutColor}55` : "none" }}
            >
              {totals.byQty.toFixed(1)}
              <span className="text-2xl align-top ml-1">%</span>
            </div>
          </div>

          <div className="flex gap-8">
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TOKENS.textSecondary }}>Itens corretos</div>
              <div className="mono text-2xl font-medium" style={{ color: TOKENS.textPrimary }}>{totals.skuOk}/{rows.length}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TOKENS.textSecondary }}>Acurácia por SKU</div>
              <div className="mono text-2xl font-medium" style={{ color: TOKENS.textPrimary }}>{totals.bySku.toFixed(1)}%</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TOKENS.textSecondary }}>Divergência total</div>
              <div className="mono text-2xl font-medium" style={{ color: TOKENS.textPrimary }}>{totals.totalAbsDiff}</div>
            </div>
          </div>
        </div>

        {stockValue > 0 && (
          <p className="text-xs mb-4 no-print" style={{ color: TOKENS.textSecondary }}>
            Valor total do estoque (itens com custo cadastrado):{" "}
            <span className="mono font-medium" style={{ color: TOKENS.textPrimary }}>
              {stockValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </p>
        )}

        {/* Toolbar */}
        <div className="no-print flex flex-wrap gap-2 mb-4">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleImportFile}
            style={{ display: "none" }}
          />
          <button onClick={triggerImport} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded hover:opacity-80" style={toolbarBtnStyle()}>
            <Upload size={13} /> Importar CSV
          </button>
          <button
            onClick={() => {
              setScanFeedback(null);
              setScannerOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded hover:opacity-80"
            style={{ ...toolbarBtnStyle(), color: TOKENS.amber, borderColor: TOKENS.amberDim }}
          >
            <ScanLine size={13} /> Bipar item
          </button>
          <button onClick={exportCSV} disabled={rows.length === 0} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded hover:opacity-80 disabled:opacity-40" style={toolbarBtnStyle()}>
            <Download size={13} /> Exportar CSV
          </button>
          <button onClick={exportPDF} disabled={rows.length === 0} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded hover:opacity-80 disabled:opacity-40" style={toolbarBtnStyle()} title="Baixa um HTML pronto para imprimir/salvar como PDF">
            <Printer size={13} /> Relatório p/ PDF
          </button>
          <button onClick={closeCount} disabled={rows.length === 0} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded hover:opacity-80 disabled:opacity-40 ml-auto" style={{ ...toolbarBtnStyle(), color: TOKENS.amber, borderColor: TOKENS.amberDim }}>
            Fechar contagem no histórico
          </button>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[11px] uppercase tracking-widest" style={{ color: TOKENS.textSecondary }}>
            Backup:
          </span>
          <input
            type="file"
            accept=".json"
            ref={backupInputRef}
            onChange={handleRestoreBackup}
            style={{ display: "none" }}
          />
          <button onClick={exportBackup} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded hover:opacity-80" style={toolbarBtnStyle()}>
            <Save size={13} /> Exportar backup completo
          </button>
          <button onClick={triggerRestoreBackup} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded hover:opacity-80" style={toolbarBtnStyle()}>
            <RotateCcw size={13} /> Restaurar backup
          </button>
        </div>

        {scanNotice && (
          <p
            className="text-xs mb-2 flex items-center gap-1.5 no-print px-3 py-2 rounded"
            style={{ color: TOKENS.amber, background: TOKENS.panel, border: `1px solid ${TOKENS.amberDim}` }}
          >
            <Barcode size={12} /> {scanNotice}
          </p>
        )}

        <div className="rounded-lg p-4 mb-2 no-print" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 mb-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nome do item / SKU"
              className="mono px-3 py-2 rounded text-sm outline-none"
              style={inputStyle()}
            />
            <input
              value={barcodeField}
              onChange={(e) => setBarcodeField(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Cód. de barras (opcional)"
              className="mono px-3 py-2 rounded text-sm outline-none"
              style={inputStyle()}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[140px_140px_160px_auto] gap-3">
            <input
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Qtd. sistema"
              type="number"
              min="0"
              className="mono px-3 py-2 rounded text-sm outline-none"
              style={inputStyle()}
            />
            <input
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Qtd. contada"
              type="number"
              min="0"
              className="mono px-3 py-2 rounded text-sm outline-none"
              style={inputStyle()}
            />
            <input
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Custo unit. (opcional)"
              className="mono px-3 py-2 rounded text-sm outline-none"
              style={inputStyle()}
            />
            <button
              onClick={addItem}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: TOKENS.amber, color: "#1A1400" }}
            >
              <Plus size={16} /> Adicionar
            </button>
          </div>
          <p className="text-[11px] mt-2" style={{ color: TOKENS.textSecondary }}>
            O custo unitário (opcional) é usado só para calcular o valor total do estoque, mostrado acima da tabela.
          </p>
        </div>

        {saveError && (
          <p className="text-xs mb-4 flex items-center gap-1.5 no-print" style={{ color: TOKENS.bad }}>
            <TriangleAlert size={12} /> {saveError}
          </p>
        )}

        {loadingData ? (
          <div className="rounded-lg p-10 text-center mt-4" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
            <p className="text-sm" style={{ color: TOKENS.textSecondary }}>Carregando seus dados...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg p-10 text-center mt-4" style={{ background: TOKENS.panel, border: `1px dashed ${TOKENS.panelBorder}` }}>
            <p className="text-sm" style={{ color: TOKENS.textSecondary }}>
              Nenhum item lançado ainda. Adicione um item acima ou importe um CSV para começar.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-2 no-print">
              <div className="relative flex-1 min-w-[160px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: TOKENS.textSecondary }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou código de barras..."
                  className="mono w-full pl-8 pr-3 py-1.5 rounded text-xs outline-none"
                  style={inputStyle()}
                />
              </div>
              <button
                onClick={() => setSortMode(sortMode === "worst" ? "order" : "worst")}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded hover:opacity-80 whitespace-nowrap"
                style={toolbarBtnStyle()}
              >
                <ArrowUpDown size={12} />
                {sortMode === "worst" ? "Pior acurácia primeiro" : "Ordem de cadastro"}
              </button>
            </div>

            <p className="text-[11px] mb-2 no-print" style={{ color: TOKENS.textSecondary }}>
              Mostrando {visibleRows.length} de {searchedRows.length}
              {search ? ` (filtrado de ${rows.length} no total)` : ""}
            </p>

            {searchedRows.length === 0 ? (
              <div className="rounded-lg p-8 text-center" style={{ background: TOKENS.panel, border: `1px dashed ${TOKENS.panelBorder}` }}>
                <p className="text-sm" style={{ color: TOKENS.textSecondary }}>
                  Nenhum item encontrado para "{search}".
                </p>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
                <div
                  className="hidden sm:grid grid-cols-[1fr_90px_90px_90px_90px_36px] px-4 py-2 text-xs uppercase tracking-widest"
                  style={{ color: TOKENS.textSecondary, borderBottom: `1px solid ${TOKENS.panelBorder}` }}
                >
                  <div>Item</div>
                  <div className="text-right">Sistema</div>
                  <div className="text-right">Contado</div>
                  <div className="text-right">Diverg.</div>
                  <div className="text-right">Acurácia</div>
                  <div className="no-print"></div>
                </div>
                {visibleRows.map((r) => (
                  <div key={r.id} style={{ borderBottom: `1px solid ${TOKENS.panelBorder}` }}>
                    {/* Cartão — telas pequenas */}
                    <div className="sm:hidden px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <input
                            value={r.name}
                            onChange={(e) => updateItemField(r.id, "name", e.target.value)}
                            onBlur={handleFieldBlur}
                            className="name-input mono text-sm font-medium"
                            style={{ color: TOKENS.textPrimary }}
                          />
                          {r.barcode && (
                            <div className="flex items-center gap-1 mt-0.5" style={{ color: TOKENS.textSecondary }}>
                              <Barcode size={10} />
                              <span className="text-[10px] mono truncate">{r.barcode}</span>
                            </div>
                          )}
                        </div>
                        <button onClick={() => removeItem(r.id)} className="p-1 rounded hover:opacity-80 shrink-0" style={{ color: TOKENS.textSecondary }} aria-label={`Remover ${r.name}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <div className="flex items-center justify-between rounded px-2 py-1" style={{ background: TOKENS.bg }}>
                          <span style={{ color: TOKENS.textSecondary }}>Sistema</span>
                          <input
                            value={r.expected}
                            onChange={(e) => updateItemField(r.id, "expected", e.target.value)}
                            onBlur={handleFieldBlur}
                            type="number"
                            className="cell-input mono w-14"
                            style={{ color: TOKENS.textPrimary }}
                          />
                        </div>
                        <div className="flex items-center justify-between rounded px-2 py-1" style={{ background: TOKENS.bg }}>
                          <span style={{ color: TOKENS.textSecondary }}>Contado</span>
                          <input
                            value={r.counted}
                            onChange={(e) => updateItemField(r.id, "counted", e.target.value)}
                            onBlur={handleFieldBlur}
                            type="number"
                            className="cell-input mono w-14"
                            style={{ color: TOKENS.textPrimary }}
                          />
                        </div>
                        <div className="flex items-center justify-between rounded px-2 py-1" style={{ background: TOKENS.bg }}>
                          <span style={{ color: TOKENS.textSecondary }}>Diverg.</span>
                          <span className="mono flex items-center gap-1" style={{ color: r.diff === 0 ? TOKENS.textSecondary : TOKENS.bad }}>
                            {r.diff !== 0 && <TriangleAlert size={11} />}
                            {r.diff > 0 ? `+${r.diff}` : r.diff}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded px-2 py-1" style={{ background: TOKENS.bg }}>
                          <span style={{ color: TOKENS.textSecondary }}>Acurácia</span>
                          <span className="mono font-medium" style={{ color: statusColor(r.pct) }}>{r.pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Linha de grade — telas médias e maiores */}
                    <div className="hidden sm:grid grid-cols-[1fr_90px_90px_90px_90px_36px] px-4 py-2 items-center text-sm">
                      <div className="min-w-0">
                        <input
                          value={r.name}
                          onChange={(e) => updateItemField(r.id, "name", e.target.value)}
                          onBlur={handleFieldBlur}
                          className="name-input mono print-text"
                          style={{ color: TOKENS.textPrimary }}
                        />
                        {r.barcode && (
                          <div className="flex items-center gap-1 mt-0.5" style={{ color: TOKENS.textSecondary }}>
                            <Barcode size={10} />
                            <span className="text-[10px] mono truncate">{r.barcode}</span>
                          </div>
                        )}
                      </div>
                      <input
                        value={r.expected}
                        onChange={(e) => updateItemField(r.id, "expected", e.target.value)}
                        onBlur={handleFieldBlur}
                        type="number"
                        className="cell-input mono print-text"
                        style={{ color: TOKENS.textSecondary }}
                      />
                      <input
                        value={r.counted}
                        onChange={(e) => updateItemField(r.id, "counted", e.target.value)}
                        onBlur={handleFieldBlur}
                        type="number"
                        className="cell-input mono print-text"
                        style={{ color: TOKENS.textSecondary }}
                      />
                      <div
                        className="mono text-right flex items-center justify-end gap-1 print-text"
                        style={{ color: r.diff === 0 ? TOKENS.textSecondary : TOKENS.bad }}
                      >
                        {r.diff !== 0 && <TriangleAlert size={12} />}
                        {r.diff > 0 ? `+${r.diff}` : r.diff}
                      </div>
                      <div className="mono text-right font-medium print-text" style={{ color: statusColor(r.pct) }}>
                        {r.pct.toFixed(0)}%
                      </div>
                      <div className="flex justify-end no-print">
                        <button onClick={() => removeItem(r.id)} className="p-1.5 rounded hover:opacity-80" style={{ color: TOKENS.textSecondary }} aria-label={`Remover ${r.name}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchedRows.length > visibleRows.length && (
              <div className="flex justify-center mt-3 no-print">
                <button
                  onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                  className="text-xs px-4 py-2 rounded hover:opacity-80"
                  style={toolbarBtnStyle()}
                >
                  Carregar mais ({searchedRows.length - visibleRows.length} restantes)
                </button>
              </div>
            )}
          </>
        )}

        {history.length > 0 && (
          <div className="rounded-lg p-4 mt-6" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
            <div className="text-xs uppercase tracking-widest mb-3" style={{ color: TOKENS.textSecondary }}>
              Histórico de acurácia ({history.length} {history.length === 1 ? "contagem" : "contagens"})
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={history.map((h) => ({ ...h, label: formatDate(h.date) }))}>
                <CartesianGrid stroke={TOKENS.panelBorder} strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke={TOKENS.textSecondary} fontSize={11} />
                <YAxis stroke={TOKENS.textSecondary} fontSize={11} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: TOKENS.bg, border: `1px solid ${TOKENS.panelBorder}`, fontSize: 12 }}
                  labelStyle={{ color: TOKENS.textPrimary }}
                />
                <Line type="monotone" dataKey="byQty" name="Acurácia por qtd." stroke={TOKENS.amber} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="bySku" name="Acurácia por SKU" stroke={TOKENS.good} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>

      {scannerOpen && (
        <BarcodeScanner
          onDetected={handleScan}
          feedback={scanFeedback}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}
