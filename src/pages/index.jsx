import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import Customers from "./Customers";

import Vehicles from "./Vehicles";

import ServiceCatalog from "./ServiceCatalog";

import Quotes from "./Quotes";

import NewQuote from "./NewQuote";

import QuoteDetail from "./QuoteDetail";

import Reminders from "./Reminders";

import ServiceOrders from "./ServiceOrders";

import Suppliers from "./Suppliers";

import VehicleHistory from "./VehicleHistory";

import VehicleSearch from "./VehicleSearch";

import PendingPayments from "./PendingPayments";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Dashboard: Dashboard,
    
    Customers: Customers,
    
    Vehicles: Vehicles,
    
    ServiceCatalog: ServiceCatalog,
    
    Quotes: Quotes,
    
    NewQuote: NewQuote,
    
    QuoteDetail: QuoteDetail,
    
    Reminders: Reminders,
    
    ServiceOrders: ServiceOrders,
    
    Suppliers: Suppliers,
    
    VehicleHistory: VehicleHistory,
    
    VehicleSearch: VehicleSearch,
    
    PendingPayments: PendingPayments,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Dashboard />} />
                
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/Customers" element={<Customers />} />
                
                <Route path="/Vehicles" element={<Vehicles />} />
                
                <Route path="/ServiceCatalog" element={<ServiceCatalog />} />
                
                <Route path="/Quotes" element={<Quotes />} />
                
                <Route path="/NewQuote" element={<NewQuote />} />
                
                <Route path="/QuoteDetail" element={<QuoteDetail />} />
                
                <Route path="/Reminders" element={<Reminders />} />
                
                <Route path="/ServiceOrders" element={<ServiceOrders />} />
                
                <Route path="/Suppliers" element={<Suppliers />} />
                
                <Route path="/VehicleHistory" element={<VehicleHistory />} />
                
                <Route path="/VehicleSearch" element={<VehicleSearch />} />
                
                <Route path="/PendingPayments" element={<PendingPayments />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}