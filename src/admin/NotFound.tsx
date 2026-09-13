import React from "react";

// Deliberately generic. A wrong secret path renders this and is
// indistinguishable from any other unknown URL — no hint that an admin
// area exists.
const NotFound: React.FC = () => (
  <div className="min-h-screen bg-[#0B0C0E] text-[#F4F2EE] flex items-center justify-center px-4"
       style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
    <div className="text-center">
      <div className="text-6xl font-extrabold tracking-tight">404</div>
      <p className="mt-3 text-[#93959C]">This page could not be found.</p>
      <a href="/" className="mt-6 inline-block text-[#E11D2E] text-sm hover:underline">Go home</a>
    </div>
  </div>
);

export default NotFound;
