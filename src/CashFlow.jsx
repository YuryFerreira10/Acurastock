import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus,
  Trash2,
  TriangleAlert,
  Download,
  Upload,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import Papa from "papaparse";
import { storage } from "./storage.js";
import { TOKENS } from "./tokens.js";

const DEFAULT_CATEGORIES = [
  "Vendas",
  "Compra de estoque",
  "Despesas fixas",
  "Despesas variáveis",
  "Impostos",
  "Frete",
  "Salários",
  "Outros",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

function formatMoney(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

export default function CashFlow({ workspace }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState("entrada"); // 'entrada' | 'saida'

  const [monthFilter, setMonthFilter] = useState("todos");

  const workspaceRef = useRef(workspace);
  const fileInputRef = useRef(null);
  workspaceRef.current = workspace;

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await storage.get(`acurastock:cashflow:${workspace.slug}`);
        if (!cancelled) setTransactions(res ? JSON.parse(res.value) : []);
      } catch (e) {
        if (!cancelled) setTransactions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  async function persist(next) {
    const ws = workspaceRef.current;
    if (!ws) return;
    setSaveError("");
    try {
      const result = await storage.set(`acurastock:cashflow:${ws.slug}`, JSON.stringify(next));
      if (!result) setSaveError("Não foi possível salvar. Tente novamente.");
    } catch (e) {
      setSaveError("Não foi possível salvar. Tente novamente.");
    }
  }

  function addTransaction() {
    const val = parseFloat(value.replace(",", "."));
    if (!description.trim() || isNaN(val) || val <= 0) return;
    const next = [
      ...transactions,
      {
        id: Date.now() + Math.random(),
        date,
        description: description.trim(),
        category: category.trim() || "Outros",
        value: val,
        type,
      },
    ];
    setTransactions(next);
    persist(next);
    setDescription("");
    setValue("");
    setCategory("");
  }

  function removeTransaction(id) {
    const next = transactions.filter((t) => t.id !== id);
    setTransactions(next);
    persist(next);
  }

  const categoryOptions = useMemo(() => {
    const used = transactions.map((t) => t.category);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...used]));
  }, [transactions]);

  const availableMonths = useMemo(() => {
    const keys = Array.from(new Set(transactions.map((t) => monthKey(t.date)))).sort();
    return keys;
  }, [transactions]);

  const filtered = useMemo(() => {
    if (monthFilter === "todos") return transactions;
    return transactions.filter((t) => monthKey(t.date) === monthFilter);
  }, [transactions, monthFilter]);

  const summary = useMemo(() => {
    const entradas = filtered.filter((t) => t.type === "entrada").reduce((s, t) => s + t.value, 0);
    const saidas = filtered.filter((t) => t.type === "saida").reduce((s, t) => s + t.value, 0);
    const saldoTotal = transactions.reduce(
      (s, t) => s + (t.type === "entrada" ? t.value : -t.value),
      0
    );
    return { entradas, saidas, resultado: entradas - saidas, saldoTotal };
  }, [filtered, transactions]);

  const categoryBreakdown = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      if (!map[t.category]) map[t.category] = { entradas: 0, saidas: 0 };
      if (t.type === "entrada") map[t.category].entradas += t.value;
      else map[t.category].saidas += t.value;
    });
    return Object.entries(map)
      .map(([cat, v]) => ({ category: cat, ...v, total: v.entradas - v.saidas }))
      .sort((a, b) => b.entradas + b.saidas - (a.entradas + a.saidas));
  }, [filtered]);

  const monthlyTrend = useMemo(() => {
    const map = {};
    transactions.forEach((t) => {
      const key = monthKey(t.date);
      if (!map[key]) map[key] = { key, entradas: 0, saidas: 0 };
      if (t.type === "entrada") map[key].entradas += t.value;
      else map[key].saidas += t.value;
    });
    return Object.values(map)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ ...m, label: monthLabel(m.key), resultado: m.entradas - m.saidas }));
  }, [transactions]);

  function parseFlexibleDate(str) {
    const s = (str || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return todayISO();
  }

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
      const looksLikeHeader = isNaN(parseFloat(first[4]));
      if (looksLikeHeader) rowsIn = rowsIn.slice(1);

      const imported = rowsIn
        .map((r) => {
          const rDate = parseFlexibleDate(r[0]);
          const description = (r[1] || "").toString().trim();
          const category = (r[2] || "").toString().trim() || "Outros";
          const typeRaw = (r[3] || "").toString().trim().toLowerCase();
          const val = parseFloat((r[4] || "").toString().replace(",", "."));
          const normType = typeRaw.startsWith("entr")
            ? "entrada"
            : typeRaw.startsWith("sa")
            ? "saida"
            : null;
          if (!description || !normType || isNaN(val) || val <= 0) return null;
          return {
            id: Date.now() + Math.random(),
            date: rDate,
            description,
            category,
            type: normType,
            value: val,
          };
        })
        .filter(Boolean);

      if (imported.length === 0) {
        setSaveError(
          'Não encontrei linhas válidas no CSV (esperado: data, descricao, categoria, tipo [entrada/saida], valor).'
        );
        return;
      }
      const next = [...transactions, ...imported];
      setTransactions(next);
      persist(next);
      setSaveError("");
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  function exportCSV() {
    const header = ["Data", "Descricao", "Categoria", "Tipo", "Valor"];
    const lines = [header.join(",")];
    filtered
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((t) => {
        const safeDesc = t.description.includes(",") ? `"${t.description}"` : t.description;
        lines.push([t.date, safeDesc, t.category, t.type, t.value.toFixed(2)].join(","));
      });
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `caixa-${workspace.slug}-${monthFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sortedList = useMemo(
    () => [...filtered].sort((a, b) => b.date.localeCompare(a.date)),
    [filtered]
  );

  return (
    <div>
      {/* Resumo */}
      <div
        className="rounded-lg p-6 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-6"
        style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
      >
        <div>
          <div className="text-xs uppercase tracking-widest mb-1 flex items-center gap-1" style={{ color: TOKENS.textSecondary }}>
            <Wallet size={12} /> Saldo atual
          </div>
          <div className="mono text-xl font-semibold" style={{ color: summary.saldoTotal >= 0 ? TOKENS.good : TOKENS.bad }}>
            {formatMoney(summary.saldoTotal)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TOKENS.textSecondary }}>Entradas</div>
          <div className="mono text-xl font-semibold" style={{ color: TOKENS.good }}>{formatMoney(summary.entradas)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TOKENS.textSecondary }}>Saídas</div>
          <div className="mono text-xl font-semibold" style={{ color: TOKENS.bad }}>{formatMoney(summary.saidas)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TOKENS.textSecondary }}>Resultado do período</div>
          <div className="mono text-xl font-semibold" style={{ color: summary.resultado >= 0 ? TOKENS.good : TOKENS.bad }}>
            {formatMoney(summary.resultado)}
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="rounded-lg p-4 mb-4" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setType("entrada")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-sm font-medium"
            style={{
              background: type === "entrada" ? TOKENS.good : TOKENS.bg,
              color: type === "entrada" ? "#0A2417" : TOKENS.textSecondary,
              border: `1px solid ${type === "entrada" ? TOKENS.good : TOKENS.panelBorder}`,
            }}
          >
            <ArrowUpCircle size={14} /> Entrada
          </button>
          <button
            onClick={() => setType("saida")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-sm font-medium"
            style={{
              background: type === "saida" ? TOKENS.bad : TOKENS.bg,
              color: type === "saida" ? "#2E0B08" : TOKENS.textSecondary,
              border: `1px solid ${type === "saida" ? TOKENS.bad : TOKENS.panelBorder}`,
            }}
          >
            <ArrowDownCircle size={14} /> Saída
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mono px-3 py-2 rounded text-sm outline-none" style={inputStyle()} />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Valor (ex: 150,00)"
            className="mono px-3 py-2 rounded text-sm outline-none"
            style={inputStyle()}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3 mb-3">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição (ex: Venda balcão, Compra de parafusos)"
            className="mono px-3 py-2 rounded text-sm outline-none"
            style={inputStyle()}
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Categoria"
            list="categoria-options"
            className="mono px-3 py-2 rounded text-sm outline-none"
            style={inputStyle()}
          />
          <datalist id="categoria-options">
            {categoryOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <button
          onClick={addTransaction}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: TOKENS.amber, color: "#1A1400" }}
        >
          <Plus size={16} /> Lançar
        </button>
      </div>

      {saveError && (
        <p className="text-xs mb-4 flex items-center gap-1.5" style={{ color: TOKENS.bad }}>
          <TriangleAlert size={12} /> {saveError}
        </p>
      )}

      {/* Filtro + export */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="mono px-3 py-1.5 rounded text-xs outline-none"
          style={inputStyle()}
        >
          <option value="todos">Todos os meses</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <input
          type="file"
          accept=".csv"
          ref={fileInputRef}
          onChange={handleImportFile}
          style={{ display: "none" }}
        />
        <button onClick={triggerImport} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded hover:opacity-80 ml-auto" style={toolbarBtnStyle()}>
          <Upload size={13} /> Importar CSV
        </button>
        <button onClick={exportCSV} disabled={filtered.length === 0} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded hover:opacity-80 disabled:opacity-40" style={toolbarBtnStyle()}>
          <Download size={13} /> Exportar CSV
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg p-10 text-center" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
          <p className="text-sm" style={{ color: TOKENS.textSecondary }}>Carregando lançamentos...</p>
        </div>
      ) : sortedList.length === 0 ? (
        <div className="rounded-lg p-10 text-center" style={{ background: TOKENS.panel, border: `1px dashed ${TOKENS.panelBorder}` }}>
          <p className="text-sm" style={{ color: TOKENS.textSecondary }}>
            Nenhum lançamento ainda. Registre uma entrada ou saída acima para começar.
          </p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden mb-6" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
          <div
            className="hidden sm:grid grid-cols-[80px_1fr_120px_90px_36px] px-4 py-2 text-xs uppercase tracking-widest"
            style={{ color: TOKENS.textSecondary, borderBottom: `1px solid ${TOKENS.panelBorder}` }}
          >
            <div>Data</div>
            <div>Descrição</div>
            <div>Categoria</div>
            <div className="text-right">Valor</div>
            <div></div>
          </div>
          {sortedList.map((t) => (
            <div key={t.id} style={{ borderBottom: `1px solid ${TOKENS.panelBorder}` }}>
              {/* Cartão — telas pequenas */}
              <div className="sm:hidden px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate pr-2" style={{ color: TOKENS.textPrimary }}>
                    {t.description}
                  </span>
                  <button onClick={() => removeTransaction(t.id)} className="p-1 rounded hover:opacity-80 shrink-0" style={{ color: TOKENS.textSecondary }} aria-label="Remover lançamento">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: TOKENS.textSecondary }}>
                    {t.date.split("-").reverse().join("/").slice(0, 5)} · {t.category}
                  </span>
                  <span className="mono text-sm font-medium" style={{ color: t.type === "entrada" ? TOKENS.good : TOKENS.bad }}>
                    {t.type === "entrada" ? "+" : "-"}{formatMoney(t.value)}
                  </span>
                </div>
              </div>

              {/* Linha de grade — telas médias e maiores */}
              <div className="hidden sm:grid grid-cols-[80px_1fr_120px_90px_36px] px-4 py-2.5 items-center text-sm">
                <div className="mono text-xs" style={{ color: TOKENS.textSecondary }}>
                  {t.date.split("-").reverse().join("/").slice(0, 5)}
                </div>
                <div className="truncate pr-2" style={{ color: TOKENS.textPrimary }}>{t.description}</div>
                <div className="text-xs truncate" style={{ color: TOKENS.textSecondary }}>{t.category}</div>
                <div className="mono text-right text-sm font-medium" style={{ color: t.type === "entrada" ? TOKENS.good : TOKENS.bad }}>
                  {t.type === "entrada" ? "+" : "-"}{formatMoney(t.value)}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => removeTransaction(t.id)} className="p-1.5 rounded hover:opacity-80" style={{ color: TOKENS.textSecondary }} aria-label="Remover lançamento">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumo por categoria */}
      {categoryBreakdown.length > 0 && (
        <div className="rounded-lg p-4 mb-6" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
          <div className="text-xs uppercase tracking-widest mb-3" style={{ color: TOKENS.textSecondary }}>
            Resumo por categoria {monthFilter !== "todos" ? `(${monthLabel(monthFilter)})` : "(todos os meses)"}
          </div>
          <div className="space-y-2">
            {categoryBreakdown.map((c) => (
              <div key={c.category} className="flex items-center justify-between text-sm">
                <span style={{ color: TOKENS.textPrimary }}>{c.category}</span>
                <span className="mono text-xs">
                  {c.entradas > 0 && <span style={{ color: TOKENS.good }}>+{formatMoney(c.entradas)} </span>}
                  {c.saidas > 0 && <span style={{ color: TOKENS.bad }}>-{formatMoney(c.saidas)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico de tendência mensal */}
      {monthlyTrend.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}>
          <div className="text-xs uppercase tracking-widest mb-3" style={{ color: TOKENS.textSecondary }}>
            Resultado mensal (entradas − saídas)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid stroke={TOKENS.panelBorder} strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke={TOKENS.textSecondary} fontSize={11} />
              <YAxis stroke={TOKENS.textSecondary} fontSize={11} />
              <Tooltip
                contentStyle={{ background: TOKENS.bg, border: `1px solid ${TOKENS.panelBorder}`, fontSize: 12 }}
                labelStyle={{ color: TOKENS.textPrimary }}
                formatter={(v) => formatMoney(v)}
              />
              <Bar dataKey="resultado" radius={[4, 4, 0, 0]}>
                {monthlyTrend.map((m, i) => (
                  <Cell key={i} fill={m.resultado >= 0 ? TOKENS.good : TOKENS.bad} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
