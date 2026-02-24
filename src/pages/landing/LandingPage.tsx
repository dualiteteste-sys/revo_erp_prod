import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/landing/Header';
import Hero from '../../components/landing/Hero';
import IndustrySection from '../../components/landing/IndustrySection';
import ServicesSection from '../../components/landing/ServicesSection';
import CommerceSection from '../../components/landing/CommerceSection';
import Features from '../../components/landing/Features';
import Pricing from '../../components/landing/Pricing';
import FAQ from '../../components/landing/FAQ';
import Footer from '../../components/landing/Footer';
import { useAuth } from '@/contexts/AuthProvider';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  React.useEffect(() => {
    if (loading) return;
    if (!session) return;
    navigate('/app/dashboard', { replace: true });
  }, [loading, navigate, session]);

  return (
    <div className="bg-slate-50 text-gray-900">
      <Header onLoginClick={() => navigate('/auth/login')} />
      <main>
        <Hero />
        <IndustrySection />
        <ServicesSection />
        <CommerceSection />
        <Pricing />
        <Features />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
