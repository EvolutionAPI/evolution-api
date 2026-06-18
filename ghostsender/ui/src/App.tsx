import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Warmup from './pages/Warmup'
import Blast from './pages/Blast'
import Verify from './pages/Verify'
import Instances from './pages/Instances'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="warmup"    element={<Warmup />} />
          <Route path="blast"     element={<Blast />} />
          <Route path="verify"    element={<Verify />} />
          <Route path="instances" element={<Instances />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
