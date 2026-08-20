import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ThemeToggle } from "./components/ThemeToggle";
import { SearchPage } from "./pages/SearchPage";
import { EntityPage } from "./pages/EntityPage";
import { GraphPage } from "./pages/GraphPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter basename="/open-sources">
      <ScrollToTop />
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/entity/:id" element={<EntityPage />} />
        <Route path="/entity/:id/graph" element={<GraphPage />} />
      </Routes>
    </BrowserRouter>
  );
}
