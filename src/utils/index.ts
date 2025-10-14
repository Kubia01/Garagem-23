


export function createPageUrl(pageName: string) {
    // Keep route casing consistent with Route path definitions
    return '/' + String(pageName).replace(/\s+/g, '');
}

export function hasAccess(role: string | undefined, pageName: string): boolean {
    // Simple role-based example that can be extended:
    // - 'admin' can access all pages
    // - 'manager' cannot access Suppliers management, for example
    // - 'operator' has read-only access patterns (UI can hide buttons)
    if (!role) return false;
    if (role === 'admin') return true;
    const normalized = String(pageName)
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/-/g, '');
    if (role === 'manager') {
        // example restriction: block access to suppliers page
        return normalized !== 'suppliers';
    }
    if (role === 'operator') {
        // allow core operational pages only
        const allowed = [
            'dashboard', 'customers', 'vehicles', 'quotes', 'quotedetail',
            'serviceorders', 'vehiclehistory', 'vehiclesearch', 'reminders', 'pendingpayments',
            // Expanded access
            'servicecatalog', 'suppliers', 'newquote'
        ];
        return allowed.includes(normalized);
    }
    return false;
}