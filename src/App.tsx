import { Navigate, Route, Routes } from 'react-router'
import { FacilityPcFormPage } from './pages/FacilityPcFormPage'
import { FacilityPcListPage } from './pages/FacilityPcListPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<FacilityPcListPage />} />
      <Route path="/new" element={<FacilityPcFormPage />} />
      <Route path="/edit/:id" element={<FacilityPcFormPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
