import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, User, Clock, Check, CheckCheck, MessageSquare, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Inbox = () => {
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('ya-user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    const fetchConversations = async () => {
      try {
        if (user.role === 'admin') {
          const res = await fetch('/api/messages/conversations');
          if (res.ok) {
            const data = await res.json();
            setConversations(data);
          }
        } else {
          // For customers, the admin is the only conversation
          setConversations([{ id: 'admin', name: 'YA Wedding Admin', role: 'admin' }]);
          setActiveChat({ id: 'admin', name: 'YA Wedding Admin', role: 'admin' });
        }
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [user]);

  const fetchMessages = async (otherUserId: string) => {
    try {
      const res = await fetch(`/api/messages/${otherUserId}?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
        scrollToBottom();
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  useEffect(() => {
    if (!activeChat || !user) return;

    fetchMessages(activeChat.id);
    const interval = setInterval(() => fetchMessages(activeChat.id), 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [activeChat, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !user) return;

    const tempMessage = {
      id: Date.now().toString(),
      sender_id: user.id,
      receiver_id: activeChat.id,
      content: newMessage,
      created_at: new Date().toISOString(),
      is_read: 0
    };

    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    scrollToBottom();

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user.id,
          receiverId: activeChat.id,
          content: tempMessage.content
        })
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }
      
      // Refresh messages to get the real ID and status
      fetchMessages(activeChat.id);
    } catch (err) {
      console.error('Error sending message:', err);
      // Remove the temp message if failed
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-20 bg-dark flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-[calc(100vh-8rem)]">
        <div className="glass-card rounded-3xl border border-white/5 h-full flex overflow-hidden">
          
          {/* Sidebar - Conversations List */}
          <div className={`w-full md:w-80 border-r border-white/5 flex flex-col ${activeChat && 'hidden md:flex'}`}>
            <div className="p-6 border-b border-white/5">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <MessageSquare className="text-brand" />
                Inbox
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {conversations.length === 0 ? (
                <div className="text-center text-gray-500 mt-10">
                  No conversations yet
                </div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveChat(conv)}
                    className={`w-full text-left p-4 rounded-xl transition-all flex items-center gap-4 ${
                      activeChat?.id === conv.id 
                        ? 'bg-brand/10 border border-brand/20' 
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-dark border border-white/10 flex items-center justify-center shrink-0">
                      <User className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold truncate">{conv.name || conv.username}</h3>
                      <p className="text-sm text-gray-400 truncate capitalize">{conv.role}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className={`flex-1 flex flex-col ${!activeChat && 'hidden md:flex'}`}>
            {activeChat ? (
              <>
                {/* Chat Header */}
                <div className="p-6 border-b border-white/5 flex items-center gap-4 bg-dark/50">
                  <button 
                    className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white"
                    onClick={() => setActiveChat(null)}
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div className="w-10 h-10 rounded-full bg-dark border border-white/10 flex items-center justify-center">
                    <User className="text-gray-400" size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold">{activeChat.name || activeChat.username}</h3>
                    <p className="text-xs text-gray-400 capitalize">{activeChat.role}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                      <MessageSquare size={48} className="text-gray-600" />
                      <p>Send a message to start the conversation</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isMe = msg.sender_id === user.id;
                      const showAvatar = idx === 0 || messages[idx - 1].sender_id !== msg.sender_id;
                      
                      return (
                        <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${showAvatar ? 'bg-dark border border-white/10' : 'opacity-0'}`}>
                            {showAvatar && <User size={14} className="text-gray-400" />}
                          </div>
                          
                          <div className={`max-w-[70%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`px-4 py-3 rounded-2xl ${
                              isMe 
                                ? 'bg-brand text-dark rounded-tr-sm' 
                                : 'bg-white/5 border border-white/10 rounded-tl-sm'
                            }`}>
                              <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                            </div>
                            
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                              <Clock size={10} />
                              <span>{formatTime(msg.created_at)}</span>
                              {isMe && (
                                <span className="ml-1">
                                  {msg.is_read ? <CheckCheck size={12} className="text-brand" /> : <Check size={12} />}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="p-4 border-t border-white/5 bg-dark/50">
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type your message..."
                      className="flex-1 bg-dark border border-white/10 rounded-xl px-4 py-3 focus:border-brand outline-none transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim()}
                      className="bg-brand text-dark p-3 rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center"
                    >
                      <Send size={20} />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                  <MessageSquare size={32} className="text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Your Inbox</h3>
                <p>Select a conversation to start messaging</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
