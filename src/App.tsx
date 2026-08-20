import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeToggle } from "./components/ThemeToggle";
import { SearchPage } from "./pages/SearchPage";
import { EntityPage } from "./pages/EntityPage";
import { GraphPage } from "./pages/GraphPage";

export default function App() {
  return (
    <BrowserRouter>
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/entity/:id" element={<EntityPage />} />
        <Route path="/entity/:id/graph" element={<GraphPage />} />
      </Routes>
    </BrowserRouter>
  );
}
