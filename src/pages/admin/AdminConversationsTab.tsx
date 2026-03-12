import React, { useState, useEffect } from 'react';
import { MessageSquare, Eye, ShieldBan, X } from 'lucide-react';

export const AdminConversationsTab = () => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/admin/conversations', {
        headers: { 'Authorization': 'Bearer ya-admin-secret' }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    }
  };

  const handleViewConversation = async (conv: any) => {
    setSelectedConversation(conv);
    try {
      const res = await fetch(`/api/admin/conversations/${conv.id}/messages`, {
        headers: { 'Authorization': 'Bearer ya-admin-secret' }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const handleBlockUser = async (userId: string, conversationId: string) => {
    if (!confirm('Are you sure you want to block this user from this conversation?')) return;
    try {
      const res = await fetch(`/api/admin/conversations/${conversationId}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ya-admin-secret'
        },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        alert("User blocked successfully.");
      }
    } catch (error) {
      console.error("Error blocking user:", error);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Conversations</h2>
          <p className="text-gray-400 text-sm">Monitor user conversations and manage access</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {conversations.length === 0 ? (
          <div className="glass-card p-12 rounded-3xl text-center border-dashed border-2 border-white/5">
            <MessageSquare size={48} className="mx-auto mb-4 text-gray-500" />
            <h3 className="text-xl font-bold text-gray-400">No conversations found</h3>
          </div>
        ) : (
          <div className="glass-card rounded-3xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-bold text-gray-400">Conversation ID</th>
                  <th className="px-6 py-4 font-bold text-gray-400">Participants</th>
                  <th className="px-6 py-4 font-bold text-gray-400">Last Message</th>
                  <th className="px-6 py-4 font-bold text-gray-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {conversations.map((conv) => (
                  <tr key={conv.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm">{conv.id}</td>
                    <td className="px-6 py-4">
                      {conv.user1_username} & {conv.user2_username}
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {new Date(conv.updated_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleViewConversation(conv)}
                          className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
                          title="View Conversation"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          onClick={() => handleBlockUser(conv.user1_id, conv.id)}
                          className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500 transition-all"
                          title={`Block ${conv.user1_username}`}
                        >
                          <ShieldBan size={16} />
                        </button>
                        <button 
                          onClick={() => handleBlockUser(conv.user2_id, conv.id)}
                          className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500 transition-all"
                          title={`Block ${conv.user2_username}`}
                        >
                          <ShieldBan size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedConversation && (
        <div className="fixed inset-0 bg-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-lighter border border-white/10 rounded-3xl p-8 max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">
                Conversation: {selectedConversation.user1_username} & {selectedConversation.user2_username}
              </h3>
              <button onClick={() => setSelectedConversation(null)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-4">
              {messages.map((msg) => (
                <div key={msg.id} className="bg-white/5 p-4 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-brand">{msg.sender_username}</span>
                    <span className="text-xs text-gray-500">{new Date(msg.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-300">{msg.content}</p>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-center text-gray-500 py-8">No messages in this conversation yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
