'use client';

import { useEffect, useState } from 'react';

export default function TestPage() {
  const [apiStatus, setApiStatus] = useState<string>('Testing...');

  useEffect(() => {
    // Test the API proxy
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setApiStatus(`API Connected: ${JSON.stringify(data)}`);
      })
      .catch(err => {
        setApiStatus(`API Error: ${err.message}`);
      });
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Frontend Test</h1>
      <p className="mb-4">This page tests the Next.js frontend setup.</p>
      <div className="bg-gray-100 p-4 rounded">
        <strong>API Proxy Test:</strong> {apiStatus}
      </div>
    </div>
  );
}