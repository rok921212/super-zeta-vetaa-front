import React from "react";

// Shared visual primitives for the admin panel. Same "control-room" design
// language as src/login/page.tsx and src/Home.tsx:
//   bg #0B0C0E · panel #131418 · line #24262B · text #F4F2EE ·
//   muted #93959C · dim #55565C · accent (on-air red) #E11D2E
// Space Grotesk (display) / Inter (body) / JetBrains Mono (data).

export const Fonts: React.FC = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
    .ap-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
    .ap-sans { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
    .ap-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
    .ap-input {
      width: 100%; padding: 11px 13px; background: #0B0C0E;
      border: 1px solid #24262B; color: #F4F2EE;
      font-family: 'Inter', sans-serif; font-size: 14px; outline: none;
    }
    .ap-input::placeholder { color: #55565C; }
    .ap-input:focus { border-color: #E11D2E; }
    .ap-input:disabled { opacity: .5; }
    input:-webkit-autofill {
      -webkit-text-fill-color: #F4F2EE;
      -webkit-box-shadow: 0 0 0px 1000px #0B0C0E inset;
      transition: background-color 9999s ease-in-out 0s;
    }
  `}</style>
);

export const Screen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-[#0B0C0E] text-[#F4F2EE] ap-sans">
    <Fonts />
    {children}
  </div>
);

export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="inline-flex items-center gap-2">
    <span className="w-1.5 h-1.5 bg-[#E11D2E]" />
    <span className="ap-mono text-[11px] tracking-[0.24em] text-[#93959C] uppercase">{children}</span>
  </div>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }
> = ({ variant = "primary", className = "", disabled, children, ...rest }) => {
  const base = "px-4 py-2.5 ap-display font-bold text-xs tracking-wide uppercase disabled:opacity-40 disabled:cursor-not-allowed";
  const styles: Record<string, string> = {
    primary: "bg-[#E11D2E] text-white hover:bg-[#F4F2EE] hover:text-[#0B0C0E]",
    ghost: "border border-[#24262B] text-[#F4F2EE] hover:border-[#E11D2E] hover:text-[#E11D2E]",
    danger: "border border-[#E11D2E]/50 text-[#F4A8AE] hover:bg-[#E11D2E] hover:text-white",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} disabled={disabled} {...rest}>
      {children}
    </button>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => (
  <label className="block">
    <span className="ap-mono text-[10px] tracking-[0.15em] text-[#93959C] uppercase">{label}</span>
    <div className="mt-1.5">{children}</div>
    {hint && <span className="ap-mono text-[10px] text-[#55565C]">{hint}</span>}
  </label>
);

export const Banner: React.FC<{ tone?: "error" | "ok" | "info"; children: React.ReactNode }> = ({
  tone = "error",
  children,
}) => {
  const map = {
    error: "bg-[#E11D2E]/10 border-[#E11D2E]/40 text-[#F4A8AE]",
    ok: "bg-[#1DE16A]/10 border-[#1DE16A]/30 text-[#A8F4C4]",
    info: "bg-white/5 border-[#24262B] text-[#93959C]",
  } as const;
  return (
    <div className={`px-4 py-3 border text-sm ap-sans ${map[tone]}`} role="alert">
      {children}
    </div>
  );
};

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center gap-3 text-[#93959C] ap-mono text-xs tracking-[0.15em] uppercase">
    <span className="w-3 h-3 border-2 border-[#E11D2E] border-t-transparent rounded-full animate-spin" />
    {label || "Loading"}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-[#131418] border border-[#24262B] ${className}`}>{children}</div>
);

export const Badge: React.FC<{ on: boolean; children: React.ReactNode }> = ({ on, children }) => (
  <span
    className={`ap-mono text-[10px] tracking-[0.12em] uppercase px-2 py-0.5 border ${
      on ? "border-[#E11D2E]/50 text-[#F4A8AE]" : "border-[#24262B] text-[#55565C]"
    }`}
  >
    {children}
  </span>
);

export const Th: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <th className="text-left ap-mono text-[10px] tracking-[0.15em] text-[#55565C] uppercase font-medium px-3 py-2 border-b border-[#24262B]">
    {children}
  </th>
);

export const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <td className={`px-3 py-2.5 border-b border-[#1B1C21] text-sm text-[#F4F2EE] align-middle ${className}`}>{children}</td>
);
