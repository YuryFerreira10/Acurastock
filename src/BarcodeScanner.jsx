import React, { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X, ScanLine } from "lucide-react";

const TOKENS = {
  bg: "#14181C",
  panel: "#1B2126",
  panelBorder: "#2A3339",
  amber: "#F2A900",
  textPrimary: "#EDEDE5",
  textSecondary: "#8B95A1",
  good: "#4CAF7D",
  bad: "#E2574C",
};

export default function BarcodeScanner({ onDetected, feedback, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastCodeRef = useRef({ code: null, time: 0 });
  const [error, setError] = useState("");

  const handleResult = useCallback(
    (code) => {
      const now = Date.now();
      if (lastCodeRef.current.code === code && now - lastCodeRef.current.time < 1500) {
        return; // evita contar o mesmo código várias vezes seguidas
      }
      lastCodeRef.current = { code, time: now };
      onDetected(code);
    },
    [onDetected]
  );

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, err, controls) => {
        controlsRef.current = controls;
        if (!active || !result) return;
        handleResult(result.getText());
      })
      .catch(() => {
        if (active) setError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
      });

    return () => {
      active = false;
      controlsRef.current?.stop();
    };
  }, [handleResult]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
    >
      <div
        className="w-full max-w-sm rounded-lg p-4"
        style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.panelBorder}` }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2" style={{ color: TOKENS.textPrimary }}>
            <ScanLine size={16} color={TOKENS.amber} />
            <span className="text-sm font-medium">Bipar item</span>
          </div>
          <button onClick={onClose} style={{ color: TOKENS.textSecondary }} aria-label="Fechar leitor">
            <X size={18} />
          </button>
        </div>

        <div className="relative rounded overflow-hidden" style={{ background: "#000" }}>
          <video ref={videoRef} className="w-full" muted playsInline style={{ display: "block" }} />
          <div
            className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5"
            style={{ background: TOKENS.amber, boxShadow: `0 0 8px ${TOKENS.amber}` }}
          />
        </div>

        {error && (
          <p className="text-xs mt-3" style={{ color: TOKENS.bad }}>
            {error}
          </p>
        )}

        {feedback && (
          <p
            className="text-xs mt-3 text-center py-1.5 rounded"
            style={{
              color: feedback.type === "ok" ? TOKENS.good : TOKENS.amber,
              background: TOKENS.bg,
              border: `1px solid ${TOKENS.panelBorder}`,
            }}
          >
            {feedback.text}
          </p>
        )}

        <p className="text-xs mt-3 text-center" style={{ color: TOKENS.textSecondary }}>
          Aponte a câmera para o código de barras do item.
        </p>
      </div>
    </div>
  );
}
