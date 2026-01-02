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

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

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
