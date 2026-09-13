import React, { useState } from "react";
import { roleOf, roleLabel } from "./adminApi";
import { useAdminData, OverviewUser } from "./AdminDataContext";
import { Button, Field, Banner, Spinner, Card, Badge, Th, Td } from "./ui";

const emptyForm = { username: "", email: "", password: "", isAdmin: false, isSubAdmin: false, maxMatches: 0 };

const fmtLogin = (s?: string | null) => {
  if (!s) return "Never";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

const UsersPanel: React.FC<{ currentUserId: string }> = ({ currentUserId }) => {
  const ctx = useAdminData();
  const users = ctx.overview?.users ?? [];

  const [note, setNote] = useState(""); // local validation / success messages
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const flash = (msg: string) => {
    setNote(msg);
    window.setTimeout(() => setNote((n) => (n === msg ? "" : n)), 3000);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ctx.createUser({ ...form, maxMatches: Number(form.maxMatches) || 0 });
      setForm(emptyForm);
      setCreating(false);
      flash("User created.");
    } catch {
      /* ctx.error is shown by the dashboard */
    }
  };

  const toggleAdmin = (u: OverviewUser) =>
    ctx.updateUser(u._id, { isAdmin: !u.isAdmin }).then(() => flash(u.isAdmin ? "Admin revoked." : "Admin granted.")).catch(() => {});

  const toggleSubAdmin = (u: OverviewUser) =>
    ctx
      .setUserAccess(u._id, { isSubAdmin: !u.isSubAdmin })
      .then(() => flash(u.isSubAdmin ? "Sub-admin revoked." : "Sub-admin granted."))
      .catch(() => {});

  const setLimit = (u: OverviewUser) => {
    // eslint-disable-next-line no-alert
    const raw = window.prompt(`Max matches for ${u.username} (0 = unlimited):`, String(u.maxMatches ?? 0));
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      flash("Match limit must be a whole number ≥ 0.");
      return;
    }
    ctx.setUserAccess(u._id, { maxMatches: n }).then(() => flash("Match limit updated.")).catch(() => {});
  };

  const changePassword = (u: OverviewUser) => {
    // eslint-disable-next-line no-alert
    const next = window.prompt(`New password for ${u.username} (min 8 chars):`);
    if (!next) return;
    if (next.length < 8) {
      flash("Password must be at least 8 characters.");
      return;
    }
    ctx.updateUser(u._id, { password: next }).then(() => flash("Password changed.")).catch(() => {});
  };

  const rename = (u: OverviewUser) => {
    // eslint-disable-next-line no-alert
    const username = window.prompt("Username:", u.username);
    if (username == null) return;
    // eslint-disable-next-line no-alert
    const email = window.prompt("Email:", u.email);
    if (email == null) return;
    ctx.updateUser(u._id, { username, email }).then(() => flash("User updated.")).catch(() => {});
  };

  const deleteUser = (u: OverviewUser) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete ${u.username} (${u.email})? This cannot be undone.`)) return;
    ctx.deleteUser(u._id).then(() => flash("User deleted.")).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="ap-display text-lg font-bold uppercase tracking-tight">
          Users {ctx.overview && <span className="text-[#55565C]">({users.length})</span>}
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={ctx.refreshAll} disabled={ctx.loading} className="!px-3 !py-1.5">
            Refresh
          </Button>
          <Button onClick={() => setCreating((v) => !v)} className="!px-3 !py-1.5">
            {creating ? "Cancel" : "New user"}
          </Button>
        </div>
      </div>

      <Banner tone="info">
        <em>Sub-Admin</em> is a label plus a per-account match cap — it grants no panel access. The match
        limit (0 = unlimited) applies to any non-admin account; full admins are always unlimited.
      </Banner>

      {note && <Banner tone="ok">{note}</Banner>}

      {creating && (
        <Card className="p-5">
          <form onSubmit={createUser} className="grid sm:grid-cols-2 gap-4">
            <Field label="Username">
              <input
                className="ap-input"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className="ap-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Password" hint="Min 8 characters. Hashed server-side.">
              <input
                type="password"
                className="ap-input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>
            <Field label="Match limit" hint="0 = unlimited. Ignored for admins.">
              <input
                type="number"
                min={0}
                className="ap-input"
                value={form.maxMatches}
                onChange={(e) => setForm({ ...form, maxMatches: Math.max(0, parseInt(e.target.value || "0", 10)) })}
              />
            </Field>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(e) => setForm({ ...form, isAdmin: e.target.checked, isSubAdmin: e.target.checked ? false : form.isSubAdmin })}
              />
              <span className="ap-mono text-[11px] tracking-[0.12em] text-[#93959C] uppercase">Grant admin privileges</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isSubAdmin}
                disabled={form.isAdmin}
                onChange={(e) => setForm({ ...form, isSubAdmin: e.target.checked })}
              />
              <span className="ap-mono text-[11px] tracking-[0.12em] text-[#93959C] uppercase">Mark as sub-admin</span>
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={ctx.isSaving("new")}>
                {ctx.isSaving("new") ? "Creating…" : "Create user"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {!ctx.overview ? (
          <div className="p-6">
            <Spinner label="Loading users" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[820px]">
              <thead>
                <tr>
                  <Th>Username</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Match limit</Th>
                  <Th>Last login</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u._id === currentUserId;
                  const rowBusy = ctx.isSaving(u._id);
                  const role = roleOf(u);
                  return (
                    <tr key={u._id} className={rowBusy ? "opacity-50" : ""}>
                      <Td>
                        {u.username} {isSelf && <span className="text-[#55565C] ap-mono text-[10px]">(you)</span>}
                      </Td>
                      <Td className="text-[#93959C]">{u.email}</Td>
                      <Td>
                        <Badge on={role !== "user"}>{roleLabel[role]}</Badge>
                      </Td>
                      <Td className="ap-mono text-[12px]">{u.isAdmin || !u.maxMatches ? "∞" : u.maxMatches}</Td>
                      <Td className="text-[#55565C] ap-mono text-[11px]">{fmtLogin(u.lastLoginAt)}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          <Button variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={() => rename(u)} disabled={rowBusy}>
                            Edit
                          </Button>
                          <Button variant="ghost" className="!px-2 !py-1 !text-[10px]" onClick={() => changePassword(u)} disabled={rowBusy}>
                            Password
                          </Button>
                          <Button
                            variant="ghost"
                            className="!px-2 !py-1 !text-[10px]"
                            onClick={() => setLimit(u)}
                            disabled={rowBusy || u.isAdmin}
                            title={u.isAdmin ? "Admins are always unlimited" : ""}
                          >
                            Match limit
                          </Button>
                          <Button
                            variant="ghost"
                            className="!px-2 !py-1 !text-[10px]"
                            onClick={() => toggleSubAdmin(u)}
                            disabled={rowBusy || u.isAdmin}
                            title={u.isAdmin ? "An admin can't also be a sub-admin" : ""}
                          >
                            {u.isSubAdmin ? "Unset sub-admin" : "Make sub-admin"}
                          </Button>
                          <Button
                            variant="ghost"
                            className="!px-2 !py-1 !text-[10px]"
                            onClick={() => toggleAdmin(u)}
                            disabled={rowBusy || isSelf}
                            title={isSelf ? "You can't change your own role" : ""}
                          >
                            {u.isAdmin ? "Revoke admin" : "Make admin"}
                          </Button>
                          <Button
                            variant="danger"
                            className="!px-2 !py-1 !text-[10px]"
                            onClick={() => deleteUser(u)}
                            disabled={rowBusy || isSelf}
                          >
                            Delete
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <Td className="text-[#55565C]">No users.</Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default UsersPanel;
