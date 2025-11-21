import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import RevoLogo from '../../components/landing/RevoLogo';

const AuthLayout = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md z-10"
      >
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-8">
          <div className="flex justify-center mb-8">
            <RevoLogo className="h-8 w-auto text-gray-800" />
          </div>
          <Outlet />
        </div>
      </motion.div>
    </div>
  );
};

export default AuthLayout;
