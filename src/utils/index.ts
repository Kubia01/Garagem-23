


export function createPageUrl(pageName: string) {
    return '/' + pageName.toLowerCase().replace(/ /g, '-');
}

export function hasAccess(role: string | undefined, pageName: string): boolean {
    // Simple role-based example that can be extended:
    // - 'admin' can access all pages
    // - 'manager' cannot access Suppliers management, for example
    // - 'operator' has read-only access patterns (UI can hide buttons)
    if (!role) return false;
    if (role === 'admin') return true;
    const normalized = pageName.toLowerCase();
    if (role === 'manager') {
        // example restriction: block access to suppliers page
        return normalized !== 'suppliers';
    }
    if (role === 'operator') {
        // allow core operational pages only
        const allowed = [
            'dashboard', 'customers', 'vehicles', 'quotes', 'quote-detail',
            'serviceorders', 'vehiclehistory', 'vehiclesearch', 'reminders', 'pendingpayments'
        ];
        return allowed.includes(normalized);
    }
    return false;
}