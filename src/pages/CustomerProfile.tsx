import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, MapPin, CreditCard, Package, Calendar, MessageSquare, Settings, LogOut, Shield, Bell, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const CustomerProfile = () => {
  const [activeTab, setActiveTab] = useState('settings');
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('ya-user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      navigate('/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('ya-token');
    localStorage.removeItem('ya-user');
    navigate('/');
  };

  const tabs = [
    { id: 'settings', label: 'Profile Settings', icon: User },
    { id: 'address', label: 'Addresses', icon: MapPin },
    { id: 'payment', label: 'Payment Methods', icon: CreditCard },
    { id: 'orders', label: 'My Orders', icon: Package },
    { id: 'bookings', label: 'My Bookings', icon: Calendar },
    { id: 'support', label: 'Inquiry / Support', icon: MessageSquare },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Sidebar */}
          <div className="w-full md:w-64 shrink-0">
            <div className="glass-card rounded-3xl p-6 border border-white/5 sticky top-28">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-xl">
                  {user.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="font-bold text-white">{user.name}</h3>
                  <p className="text-sm text-gray-400">{user.email}</p>
                </div>
              </div>

              <nav className="space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        activeTab === tab.id
                          ? 'bg-brand text-dark font-medium'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon size={18} />
                      {tab.label}
                    </button>
                  );
                })}
                
                <div className="pt-4 mt-4 border-t border-white/5">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <LogOut size={18} />
                    Log Out
                  </button>
                </div>
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="glass-card rounded-3xl p-8 border border-white/5 min-h-[600px]">
              
              {activeTab === 'settings' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <h2 className="text-2xl font-bold mb-6">Profile Settings</h2>
                  <form className="space-y-6 max-w-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Full Name</label>
                        <input
                          type="text"
                          defaultValue={user.name}
                          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Username</label>
                        <input
                          type="text"
                          defaultValue={user.username}
                          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Email Address</label>
                        <input
                          type="email"
                          defaultValue={user.email}
                          disabled
                          className="w-full bg-dark/50 border border-white/5 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-2">Email address cannot be changed.</p>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Phone Number</label>
                        <input
                          type="tel"
                          placeholder="+971 50 123 4567"
                          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                        />
                      </div>
                    </div>
                    <button type="button" className="bg-brand text-dark px-6 py-3 rounded-xl font-bold hover:scale-[1.02] transition-transform">
                      Save Changes
                    </button>
                  </form>
                </motion.div>
              )}

              {activeTab === 'address' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Saved Addresses</h2>
                    <button className="bg-white/10 text-white px-4 py-2 rounded-xl hover:bg-white/20 transition-colors text-sm font-medium">
                      Add New Address
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-brand/30 bg-brand/5 rounded-2xl p-6 relative">
                      <div className="absolute top-4 right-4 text-brand text-xs font-bold uppercase tracking-wider bg-brand/10 px-2 py-1 rounded-md">Default</div>
                      <h4 className="font-bold text-lg mb-2">Home</h4>
                      <p className="text-gray-400 text-sm leading-relaxed mb-4">
                        123 Luxury Villa, Palm Jumeirah<br />
                        Dubai, United Arab Emirates<br />
                        PO Box 12345
                      </p>
                      <div className="flex gap-3">
                        <button className="text-sm text-brand hover:text-brand-light">Edit</button>
                        <button className="text-sm text-red-400 hover:text-red-300">Delete</button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'payment' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Payment Methods</h2>
                    <button className="bg-white/10 text-white px-4 py-2 rounded-xl hover:bg-white/20 transition-colors text-sm font-medium">
                      Add New Card
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="border border-white/10 rounded-2xl p-6 flex items-center justify-between bg-white/5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-8 bg-white rounded flex items-center justify-center">
                          <span className="text-dark font-bold italic">VISA</span>
                        </div>
                        <div>
                          <p className="font-medium">•••• •••• •••• 4242</p>
                          <p className="text-sm text-gray-400">Expires 12/25</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-brand bg-brand/10 px-2 py-1 rounded-md">Default</span>
                        <button className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'orders' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <h2 className="text-2xl font-bold mb-6">My Orders</h2>
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Package size={24} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">No orders yet</h3>
                    <p className="text-gray-400 mb-6">When you purchase products or packages, they will appear here.</p>
                    <button onClick={() => navigate('/packages')} className="bg-brand text-dark px-6 py-3 rounded-xl font-bold hover:scale-[1.02] transition-transform">
                      Browse Packages
                    </button>
                  </div>
                </motion.div>
              )}

              {activeTab === 'bookings' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <h2 className="text-2xl font-bold mb-6">My Bookings</h2>
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar size={24} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">No upcoming bookings</h3>
                    <p className="text-gray-400 mb-6">You haven't booked any consultations or services yet.</p>
                    <button onClick={() => navigate('/services')} className="bg-brand text-dark px-6 py-3 rounded-xl font-bold hover:scale-[1.02] transition-transform">
                      Explore Services
                    </button>
                  </div>
                </motion.div>
              )}

              {activeTab === 'support' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Inquiry & Support</h2>
                    <button onClick={() => navigate('/inbox')} className="bg-brand text-dark px-4 py-2 rounded-xl hover:scale-[1.02] transition-transform text-sm font-bold flex items-center gap-2">
                      <MessageSquare size={16} />
                      Go to Inbox
                    </button>
                  </div>
                  <form className="space-y-6 max-w-2xl bg-white/5 p-6 rounded-2xl border border-white/10">
                    <h3 className="text-lg font-medium mb-4">Submit a New Request</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Subject</label>
                      <input
                        type="text"
                        placeholder="What do you need help with?"
                        className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Message</label>
                      <textarea
                        rows={4}
                        placeholder="Describe your issue or inquiry in detail..."
                        className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand resize-none"
                      />
                    </div>
                    <button type="button" className="bg-white text-dark px-6 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors">
                      Submit Request
                    </button>
                  </form>
                </motion.div>
              )}

              {activeTab === 'security' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <h2 className="text-2xl font-bold mb-6">Security Settings</h2>
                  <form className="space-y-6 max-w-2xl">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium border-b border-white/10 pb-2">Change Password</h3>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Current Password</label>
                        <input
                          type="password"
                          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">New Password</label>
                        <input
                          type="password"
                          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Confirm New Password</label>
                        <input
                          type="password"
                          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
                        />
                      </div>
                    </div>
                    <button type="button" className="bg-brand text-dark px-6 py-3 rounded-xl font-bold hover:scale-[1.02] transition-transform">
                      Update Password
                    </button>
                  </form>
                </motion.div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
