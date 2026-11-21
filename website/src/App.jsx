import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import AccommodationPage from './pages/AccommodationPage.jsx';
import RoomPage from './pages/RoomPage.jsx';
import ExperiencesPage from './pages/ExperiencesPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import GalleryPage from './pages/GalleryPage.jsx';
import LocationPage from './pages/LocationPage.jsx';
import ContactPage from './pages/ContactPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import ConfirmationPage from './pages/ConfirmationPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="accommodation" element={<AccommodationPage />} />
        <Route path="accommodation/:roomId" element={<RoomPage />} />
        <Route path="experiences" element={<ExperiencesPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="location" element={<LocationPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="booking" element={<BookingPage />} />
        <Route path="booking/confirmation" element={<ConfirmationPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
