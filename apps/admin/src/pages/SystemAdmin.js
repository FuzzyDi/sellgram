import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { clearSystemToken, setSystemToken, systemApi } from '../api/client';
import Button from '../components/Button';
export default function SystemAdmin() {
    const [loggedIn, setLoggedIn] = useState(!!sessionStorage.getItem('systemToken'));
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loading, setLoading] = useState(false);
    const [dashboard, setDashboard] = useState(null);
    const [tenants, setTenants] = useState([]);
    const [stores, setStores] = useState([]);
    const [invoices, setInvoices] = useState([]);
    async function load() {
        setLoading(true);
        try {
            const [d, t, s, i] = await Promise.all([
                systemApi.dashboard(),
                systemApi.tenants('page=1&pageSize=30'),
                systemApi.stores('page=1&pageSize=30'),
                systemApi.pendingInvoices(),
            ]);
            setDashboard(d);
            setTenants(Array.isArray(t?.items) ? t.items : []);
            setStores(Array.isArray(s?.items) ? s.items : []);
            setInvoices(Array.isArray(i) ? i : []);
        }
        catch (err) {
            clearSystemToken();
            setLoggedIn(false);
            setLoginError(err.message);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (loggedIn)
            load();
    }, [loggedIn]);
    async function login() {
        setLoginError('');
        setLoading(true);
        try {
            const data = await systemApi.login(email.trim(), password);
            if (data?.token) {
                setSystemToken(data.token);
            }
            setLoggedIn(true);
        }
        catch (err) {
            setLoginError(err.message);
        }
        finally {
            setLoading(false);
        }
    }
    function logout() {
        clearSystemToken();
        setLoggedIn(false);
    }
    async function setPlan(tenantId, plan) {
        try {
            await systemApi.setTenantPlan(tenantId, plan);
            await load();
        }
        catch (err) {
            alert(err.message);
        }
    }
    async function moderateInvoice(id, action) {
        try {
            if (action === 'confirm')
                await systemApi.confirmInvoice(id);
            else
                await systemApi.rejectInvoice(id);
            await load();
        }
        catch (err) {
            alert(err.message);
        }
    }
    if (!loggedIn) {
        return (_jsxs("div", { style: { maxWidth: 420, margin: '50px auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24 }, children: [_jsx("h2", { className: "text-2xl font-bold mb-1", children: "System Admin" }), _jsx("p", { className: "text-sm text-gray-500 mb-4", children: "Separate global control panel for the whole platform." }), _jsx("input", { value: email, onChange: (e) => setEmail(e.target.value), placeholder: "Email", className: "w-full border rounded-lg px-3 py-2 text-sm mb-2" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Password", className: "w-full border rounded-lg px-3 py-2 text-sm mb-3" }), loginError && _jsx("p", { className: "text-sm text-red-600 mb-2", children: loginError }), _jsx("button", { onClick: login, disabled: loading, className: "w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50", children: loading ? 'Signing in...' : 'Sign In' })] }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold", children: "System Admin Console" }), _jsx("p", { className: "text-sm text-gray-500", children: "Global moderation and platform-level controls." })] }), _jsx(Button, { onClick: logout, className: "px-3 py-2 text-sm bg-gray-100 rounded-lg", children: "Logout" })] }), _jsx("div", { className: "grid grid-cols-4 gap-3 mb-4", children: [
                    { label: 'Tenants', value: dashboard?.tenants ?? '-' },
                    { label: 'Active Stores', value: dashboard?.activeStores ?? '-' },
                    { label: 'Pending Invoices', value: dashboard?.pendingInvoices ?? '-' },
                    { label: 'Monthly Orders', value: dashboard?.monthlyOrders ?? '-' },
                ].map((item) => (_jsxs("div", { className: "bg-white border rounded-xl p-4", children: [_jsx("p", { className: "text-xs text-gray-500", children: item.label }), _jsx("p", { className: "text-2xl font-bold mt-1", children: item.value })] }, item.label))) }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "bg-white border rounded-xl p-4", children: [_jsx("h3", { className: "font-semibold mb-3", children: "Tenants" }), _jsx("div", { className: "space-y-2 max-h-96 overflow-auto", children: tenants.map((tenant) => (_jsxs("div", { className: "border rounded-lg p-3", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: tenant.name }), _jsx("p", { className: "text-xs text-gray-500", children: tenant.slug })] }), _jsx("span", { className: "text-xs px-2 py-1 rounded bg-gray-100", children: tenant.plan })] }), _jsxs("div", { className: "mt-2 flex gap-2", children: [_jsx(Button, { onClick: () => setPlan(tenant.id, 'FREE'), className: "px-2 py-1 text-xs rounded bg-gray-100", children: "FREE" }), _jsx(Button, { onClick: () => setPlan(tenant.id, 'PRO'), className: "px-2 py-1 text-xs rounded bg-blue-100 text-blue-700", children: "PRO" }), _jsx(Button, { onClick: () => setPlan(tenant.id, 'BUSINESS'), className: "px-2 py-1 text-xs rounded bg-purple-100 text-purple-700", children: "BUSINESS" })] })] }, tenant.id))) })] }), _jsxs("div", { className: "bg-white border rounded-xl p-4", children: [_jsx("h3", { className: "font-semibold mb-3", children: "Pending Invoices" }), _jsxs("div", { className: "space-y-2 max-h-56 overflow-auto mb-4", children: [invoices.map((invoice) => (_jsxs("div", { className: "border rounded-lg p-3", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsx("p", { className: "font-medium", children: invoice.tenant?.name || invoice.tenantId }), _jsx("span", { className: "text-xs", children: invoice.plan })] }), _jsxs("p", { className: "text-sm", children: [Number(invoice.amount).toLocaleString(), " UZS"] }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: invoice.paymentRef || 'No payment ref' }), _jsxs("div", { className: "mt-2 flex gap-2", children: [_jsx(Button, { onClick: () => moderateInvoice(invoice.id, 'confirm'), className: "px-2 py-1 text-xs rounded bg-green-100 text-green-700", children: "Confirm" }), _jsx(Button, { onClick: () => moderateInvoice(invoice.id, 'reject'), className: "px-2 py-1 text-xs rounded bg-red-100 text-red-700", children: "Reject" })] })] }, invoice.id))), invoices.length === 0 && _jsx("p", { className: "text-sm text-gray-400", children: "No pending invoices." })] }), _jsx("h3", { className: "font-semibold mb-3", children: "Stores" }), _jsx("div", { className: "space-y-2 max-h-40 overflow-auto", children: stores.map((store) => (_jsxs("div", { className: "border rounded-lg p-2", children: [_jsx("p", { className: "text-sm font-medium", children: store.name }), _jsx("p", { className: "text-xs text-gray-500", children: store.tenant?.name || '-' })] }, store.id))) })] })] })] }));
}
