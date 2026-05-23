/**
 * Mock minimal de react-router-dom v7 pour les tests Jest (CRA).
 * Le vrai package utilise un `exports` field ESM-only que CRA ne sait pas
 * résoudre automatiquement. Cette version simplifiée couvre ce dont nos
 * tests RTL ont besoin (sans navigation réelle).
 *
 * Placement : <rootDir>/__mocks__/ — Jest l'auto-applique aux imports de
 * `react-router-dom` dans tous les tests (CRA convention).
 */
const React = require("react");

function Link({ to, children, ...rest }) {
  return React.createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children);
}

function Navigate({ to }) {
  return React.createElement("div", { "data-testid": "navigate", "data-to": String(to) });
}

function Routes({ children }) { return React.createElement(React.Fragment, null, children); }
function Route()             { return null; }

function MemoryRouter({ children }) { return React.createElement(React.Fragment, null, children); }
function BrowserRouter({ children }) { return React.createElement(React.Fragment, null, children); }

function useNavigate()    { return jest.fn(); }
function useLocation()    { return { pathname: "/", search: "", hash: "", state: null }; }
function useParams()      { return {}; }
function useSearchParams(){ return [new URLSearchParams(), jest.fn()]; }
function useMatch()       { return null; }
function Outlet()         { return null; }
function NavLink({ to, children, ...rest }) {
  return React.createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children);
}

module.exports = {
  Link, NavLink, Navigate, Routes, Route, Outlet,
  MemoryRouter, BrowserRouter,
  useNavigate, useLocation, useParams, useSearchParams, useMatch,
};
