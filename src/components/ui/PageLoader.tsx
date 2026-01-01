import React from 'react';
import Spinner from '@/components/ui/Spinner';

const PageLoader: React.FC = () => {
    return (
        <div className="flex items-center justify-center h-full min-h-[50vh] w-full">
            <Spinner className="text-primary" size={40} />
        </div>
    );
};

export default PageLoader;
