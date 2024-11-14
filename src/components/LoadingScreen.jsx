import React from 'react';

const LoadingScreen = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[--chat-background]">
      <div className="flex flex-col items-center space-y-6">
        {/* Main spinner container */}
        <div className="relative w-16 h-16">
          {/* Static background circle */}
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              borderWidth: '4px',
              borderStyle: 'solid',
              borderColor: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '50%'
            }}
          ></div>

          {/* Spinning gradient circle */}
          <div 
            className="absolute inset-0 rounded-full animate-spin"
            style={{
              borderWidth: '4px',
              borderStyle: 'solid',
              borderRadius: '50%',
              borderColor: 'transparent',
              borderTopColor: '#3b82f6',
              borderRightColor: 'rgba(59, 130, 246, 0.6)',
              borderBottomColor: 'rgba(59, 130, 246, 0.2)',
              borderLeftColor: 'rgba(59, 130, 246, 0.6)',
              animation: 'spin 1.5s linear infinite'
            }}
          ></div>
        </div>

        {/* Loading text */}
        <div className="text-[#4b5563] text-sm font-medium">
          Loading...
        </div>
      </div>

      {/* Add keyframes for the spin animation */}
      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen; 