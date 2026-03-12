import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playSound, stopSound } from '../utils/soundManager';
import { checkForUpdates } from '../utils/pwa';
import { Send, User, Clock, Check, CheckCheck, MessageSquare, ArrowLeft, Search, Plus, Package, LayoutDashboard, UserCircle, Video, Phone, Paperclip, Trash2, File as FileIcon, Download, X, Mic, MicOff, VideoOff, Volume2, PhoneOff, PhoneCall, Shield, Minimize2, Maximize2, Camera, UserPlus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Inbox = () => {
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [callStream, setCallStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [swapPreview, setSwapPreview] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callTimer, setCallTimer] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const callAudioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('ya-user');
    let parsedUser: any = null;
    if (storedUser) {
      parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
    } else {
      navigate('/login');
      return;
    }
    
    // Initialize WebSocket
    const connectWS = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}?userId=${parsedUser.id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'offer') {
            handleReceiveOffer(data.payload, data.fromUserId);
          } else if (data.type === 'answer') {
            handleReceiveAnswer(data.payload);
          } else if (data.type === 'ice-candidate') {
            handleReceiveIceCandidate(data.payload);
          } else if (data.type === 'chat-message') {
            const msg = data.payload;
            // Only add if it's for the active chat
            if (activeChat && (msg.sender_id === activeChat.id || msg.receiver_id === activeChat.id)) {
              setMessages(prev => {
                // Avoid duplicates
                if (prev.find(m => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
              
              // Play sound if it's an incoming message
              if (msg.sender_id !== parsedUser.id) {
                if (activeChat && (msg.sender_id === activeChat.id || msg.receiver_id === activeChat.id)) {
                  playSound('chatboxNotification');
                } else {
                  playSound('notification');
                }
              }
              
              // Scroll to bottom if user is already near bottom
              const container = messagesEndRef.current?.parentElement;
              if (container) {
                const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                if (isNearBottom || msg.sender_id === parsedUser.id) {
                  // Auto-scroll removed
                }
              }
            }
            // Refresh conversations list to show latest message/unread
            fetchConversations();
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected. Reconnecting in 3s...');
        setTimeout(connectWS, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    };

    connectWS();

    checkForUpdates();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const checkCalls = async () => {
      if (activeCall) return; // Don't check if already in a call
      try {
        const res = await fetch(`/api/calls/incoming/${user.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'calling') {
            setActiveCall({ ...data, isIncoming: true });
            playSound('calling', true);
          }
        }
      } catch (err) {
        console.error('Failed to check calls:', err);
      }
    };
    const interval = setInterval(checkCalls, 3000);
    return () => clearInterval(interval);
  }, [user, activeCall]);

  useEffect(() => {
    if (!activeCall) return;
    const checkCallStatus = async () => {
      try {
        const res = await fetch(`/api/calls/active/${user.id}`);
        if (res.ok) {
          const data = await res.json();
          if (!data || data.status === 'ended' || data.status === 'rejected' || data.status === 'missed' || data.status === 'terminated') {
            endCallLocally();
          } else if (data.status === 'connected' && activeCall.status === 'calling') {
            setActiveCall(prev => ({ ...prev, status: 'connected' }));
            callAudioRef.current?.pause();
            startCallTimer();
          }
        }
      } catch (err) {
        console.error('Failed to check call status:', err);
      }
    };
    const interval = setInterval(checkCallStatus, 2000);
    return () => clearInterval(interval);
  }, [activeCall, user]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'calling') return;
    
    const timeout = setTimeout(() => {
      if (activeCall.status === 'calling') {
        if (!activeCall.isIncoming) {
          // Caller side: mark as missed
          fetch(`/api/calls/${activeCall.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'missed' })
          }).catch(console.error);
        }
        endCallLocally();
      }
    }, 40000); // 40 seconds timeout

    return () => clearTimeout(timeout);
  }, [activeCall]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
    if (mainVideoRef.current) {
      mainVideoRef.current.srcObject = swapPreview ? callStream : remoteStream;
      mainVideoRef.current.style.transform = swapPreview ? 'scaleX(-1)' : 'none';
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = swapPreview ? remoteStream : callStream;
      previewVideoRef.current.style.transform = swapPreview ? 'none' : 'scaleX(-1)';
    }
  }, [remoteStream, callStream, activeCall?.status, swapPreview]);

  const startCallTimer = () => {
    setCallDuration(0);
    const timer = setInterval(() => {
      setCallDuration(prev => {
        if (prev >= 7200) { // 2 hours max
          handleEndCall();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    setCallTimer(timer);
  };

  const endCallLocally = () => {
    if (callStream) callStream.getTracks().forEach(t => t.stop());
    if (remoteStream) remoteStream.getTracks().forEach(t => t.stop());
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    setCallStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIsMinimized(false);
    if (callTimer) clearInterval(callTimer);
    setCallDuration(0);
    callAudioRef.current?.pause();
    if (callAudioRef.current) callAudioRef.current.currentTime = 0;
    const endSound = new Audio('https://tsameemevents.com/wp-content/uploads/declined-ended-error.mp3');
    endSound.play().catch(e => console.log('Audio play failed:', e));
  };

  const handleEndCall = async () => {
    if (!activeCall) return;
    try {
      await fetch(`/api/calls/${activeCall.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ended', duration: callDuration })
      });
    } catch (err) {
      console.error('Failed to end call:', err);
    }
    endCallLocally();
  };

  const handleAcceptCall = async (withVideo: boolean = true) => {
    if (!activeCall) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo && activeCall.type === 'video'
      });
      setCallStream(stream);

      if (peerRef.current) {
        stream.getTracks().forEach(track => {
          peerRef.current?.addTrack(track, stream);
        });
        const answer = await peerRef.current.createAnswer();
        await peerRef.current.setLocalDescription(answer);
        
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'answer',
            targetUserId: activeCall.caller_id,
            payload: answer
          }));
        }
      }

      await fetch(`/api/calls/${activeCall.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'connected' })
      });
      setActiveCall(prev => ({ ...prev, status: 'connected', type: withVideo ? prev.type : 'audio' }));
      stopSound('calling');
      startCallTimer();
    } catch (err) {
      alert('Permission denied or device not found for camera/microphone.');
      console.error('Media error:', err);
      handleRejectCall();
    }
  };

  const handleRejectCall = async () => {
    if (!activeCall) return;
    try {
      await fetch(`/api/calls/${activeCall.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' })
      });
    } catch (err) {
      console.error('Failed to reject call:', err);
    }
    endCallLocally();
  };

  const handleReceiveOffer = async (offer: RTCSessionDescriptionInit, fromUserId: string) => {
    if (!peerRef.current) {
      peerRef.current = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      peerRef.current.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            targetUserId: fromUserId,
            payload: event.candidate
          }));
        }
      };

      peerRef.current.ontrack = (event) => {
        console.log('Remote track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else {
          let stream = new MediaStream();
          stream.addTrack(event.track);
          setRemoteStream(stream);
        }
      };
    }

    await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Process queued candidates
    while (iceCandidateQueue.current.length > 0) {
      const candidate = iceCandidateQueue.current.shift();
      if (candidate) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  };

  const handleReceiveAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (peerRef.current) {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Process queued candidates
      while (iceCandidateQueue.current.length > 0) {
        const candidate = iceCandidateQueue.current.shift();
        if (candidate) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    }
  };

  const handleReceiveIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (peerRef.current && peerRef.current.remoteDescription) {
      await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      iceCandidateQueue.current.push(candidate);
    }
  };

  const fetchConversations = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/messages/conversations?userId=${user.id}&role=${user.role}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    // Check for active calls on load
    fetch(`/api/calls/active?userId=${user.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.call) {
          const call = data.call;
          // If the call is connected, it's dead because we lost WebRTC state
          // If we are the caller and it's still 'calling', it's stale
          if (call.status === 'connected' || (call.status === 'calling' && call.caller_id === user.id)) {
            fetch(`/api/calls/${call.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'terminated' })
            }).catch(console.error);
          } else if (call.status === 'calling' && call.receiver_id === user.id) {
            // It's an incoming call, show it
            setActiveCall({ ...call, isIncoming: true });
            playSound('calling', true);
          }
        }
      })
      .catch(err => console.error('Failed to check active calls:', err));
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [user]);

  const fetchMessages = async (otherUserId: string) => {
    try {
      const res = await fetch(`/api/messages/${otherUserId}?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        
        // Play sound if new message received from polling fallback
        if (data.length > messages.length && messages.length > 0) {
          const lastMsg = data[data.length - 1];
          if (lastMsg.sender_id !== user.id) {
            playSound('notification');
          }
          
          // Only scroll if we were already at the bottom
          const container = messagesEndRef.current?.parentElement;
          if (container) {
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            if (isNearBottom) {
              // Auto-scroll removed
            }
          }
        }
        
        setMessages(data);

        // Mark as read
        fetch('/api/messages/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, otherUserId })
        }).then(() => fetchConversations()); // Refresh sidebar unread counts
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  useEffect(() => {
    if (!activeChat || !user) return;

    fetchMessages(activeChat.id);
    // Polling is now a fallback, increased interval to 15s
    const interval = setInterval(() => fetchMessages(activeChat.id), 15000);
    return () => clearInterval(interval);
  }, [activeChat, user]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/messages/search?q=${query}&role=${user.role}&userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  // scrollToBottom function removed

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

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: user.id,
          receiver_id: activeChat.id,
          content: tempMessage.content
        })
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }
      
      playSound('messageDelivered');
      fetchMessages(activeChat.id);
    } catch (err) {
      console.error('Error sending message:', err);
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
    }
  };

  const toggleMute = () => {
    if (callStream) {
      callStream.getAudioTracks().forEach(track => track.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendVoiceMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendVoiceMessage = async (audioBlob: Blob) => {
    if (!activeChat || !user) return;

    const formData = new FormData();
    formData.append('file', audioBlob, 'voice-message.webm');

    let tempMessage: any = null;

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadRes.ok) throw new Error('Upload failed');
      const fileData = await uploadRes.json();

      tempMessage = {
        id: Date.now().toString(),
        sender_id: user.id,
        receiver_id: activeChat.id,
        content: '[Voice Message]',
        file_url: fileData.url,
        file_name: fileData.name,
        file_type: 'audio/webm',
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, tempMessage]);

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: user.id,
          receiver_id: activeChat.id,
          content: '[Voice Message]',
          file_url: fileData.url,
          file_name: fileData.name,
          file_type: 'audio/webm',
        })
      });

      if (!res.ok) throw new Error('Failed to send message');
      fetchMessages(activeChat.id);
    } catch (err) {
      console.error('Error sending voice message:', err);
      if (tempMessage) {
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
      }
    }
  };

  const toggleVideo = () => {
    if (callStream) {
      callStream.getVideoTracks().forEach(track => track.enabled = isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  const flipCamera = async () => {
    if (!callStream) return;
    const videoTrack = callStream.getVideoTracks()[0];
    const currentFacingMode = videoTrack.getSettings().facingMode;
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: true
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      
      const sender = peerRef.current?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
      
      videoTrack.stop();
      setCallStream(newStream);
    } catch (err) {
      console.error('Error flipping camera:', err);
    }
  };

  const handleCall = async (type: 'audio' | 'video') => {
    if (!activeChat) return;
    if (activeChat.calls_enabled === 0) {
      alert(`${activeChat.name || activeChat.username} has disabled calls.`);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });
      setCallStream(stream);

      // Initialize PeerConnection
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
      peerRef.current = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      peerRef.current.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            targetUserId: activeChat.id,
            payload: event.candidate
          }));
        }
      };

      peerRef.current.ontrack = (event) => {
        console.log('Remote track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else {
          let stream = new MediaStream();
          stream.addTrack(event.track);
          setRemoteStream(stream);
        }
      };

      stream.getTracks().forEach(track => {
        peerRef.current?.addTrack(track, stream);
      });

      const offer = await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);

      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_id: user.id,
          receiver_id: activeChat.id,
          type
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setActiveCall({
          id: data.callId,
          caller_id: user.id,
          receiver_id: activeChat.id,
          type,
          status: 'calling',
          isIncoming: false,
          receiver_name: activeChat.name,
          receiver_username: activeChat.username,
          receiver_role: activeChat.role
        });

        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'offer',
            targetUserId: activeChat.id,
            payload: offer
          }));
        }

        callAudioRef.current?.play().catch(e => console.log('Audio play failed:', e));
      } else {
        stream.getTracks().forEach(track => track.stop());
        if (peerRef.current) {
          peerRef.current.close();
          peerRef.current = null;
        }
        alert('Failed to start call. Server might be busy.');
      }
    } catch (err) {
      alert('Permission denied or device not found for camera/microphone.');
      console.error('Media error:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat || !user) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadRes.ok) throw new Error('Upload failed');
      const fileData = await uploadRes.json();

      const tempMessage = {
        id: Date.now().toString(),
        sender_id: user.id,
        receiver_id: activeChat.id,
        content: `Sent a file: ${file.name}`,
        file_url: fileData.url,
        file_name: fileData.name,
        file_type: fileData.type,
        file_size: fileData.size,
        created_at: new Date().toISOString(),
        is_read: 0
      };

      setMessages(prev => [...prev, tempMessage]);

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: user.id,
          receiver_id: activeChat.id,
          content: tempMessage.content,
          file_url: tempMessage.file_url,
          file_name: tempMessage.file_name,
          file_type: tempMessage.file_type,
          file_size: tempMessage.file_size
        })
      });

      if (!res.ok) throw new Error('Failed to send message');
      fetchMessages(activeChat.id);
    } catch (err) {
      console.error('File upload error:', err);
      alert('Failed to send file.');
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (user?.role !== 'admin') return;
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    
    try {
      const res = await fetch(`/api/admin/messages/${msgId}`, { method: 'DELETE' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const renderMessageContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        const isImage = /\.(jpeg|jpg|gif|png|webp)$/i.test(part);
        const isVideo = /\.(mp4|webm|ogg)$/i.test(part);
        
        return (
          <span key={i}>
            <a href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">
              {part}
            </a>
            {isImage && (
              <div className="mt-2">
                <img src={part} alt="Preview" className="max-w-full rounded-lg max-h-48 object-cover" />
              </div>
            )}
            {isVideo && (
              <div className="mt-2">
                <video src={part} controls className="max-w-full rounded-lg max-h-48" />
              </div>
            )}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleProfileRedirect = () => {
    if (!user) return;
    if (user.role === 'admin') {
      navigate('/admin');
    } else if (user.role === 'partner') {
      navigate('/dashboard');
    } else {
      navigate('/profile'); // Customer profile
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-20 bg-dark flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark flex flex-col pt-20">
      {/* Call UI */}
      <AnimatePresence>
        {activeCall && !isMinimized && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 bg-dark flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Audio element for remote stream */}
            {activeCall.status === 'connected' && (
              <audio 
                autoPlay 
                playsInline
                ref={remoteAudioRef}
              />
            )}

            {/* Background for video call */}
            {activeCall.type === 'video' && activeCall.status === 'connected' && (
              <video 
                autoPlay 
                playsInline 
                muted={swapPreview}
                ref={mainVideoRef}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            
            {/* Small preview for video call */}
            {activeCall.type === 'video' && activeCall.status === 'connected' && (
              <div 
                onClick={() => setSwapPreview(!swapPreview)}
                className="absolute top-20 right-6 w-32 h-48 bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10 z-20 cursor-pointer hover:scale-105 transition-transform"
              >
                <video 
                  autoPlay 
                  playsInline 
                  muted={!swapPreview}
                  ref={previewVideoRef}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Top Bar */}
            <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-20 bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                <Shield size={16} className="text-brand" />
                <span className="text-sm font-medium">Call may be monitored</span>
              </div>
              <button 
                onClick={() => setIsMinimized(true)}
                className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full transition-colors"
              >
                <Minimize2 size={24} />
              </button>
            </div>

            {/* Center Info */}
            <div className="z-10 flex flex-col items-center text-center mt-10">
              {(!activeCall.isIncoming || activeCall.status === 'connected') && (
                <>
                  <div className="w-32 h-32 rounded-full bg-brand/20 flex items-center justify-center mb-6 border-4 border-brand/30 relative">
                    <User size={64} className="text-brand" />
                    <div className="absolute bottom-2 right-2 w-4 h-4 bg-green-500 rounded-full border-2 border-dark" />
                  </div>
                  <h2 className="text-3xl font-bold mb-2">
                    {activeCall.isIncoming ? (activeCall.caller_name || activeCall.caller_username) : (activeCall.receiver_name || activeCall.receiver_username)}
                  </h2>
                  <p className="text-gray-400 mb-4">
                    {activeCall.isIncoming ? activeCall.caller_role : activeCall.receiver_role}
                  </p>
                  
                  <div className="text-xl font-medium text-brand">
                    {activeCall.status === 'calling' ? (
                      <span className="animate-pulse">
                        {activeCall.isIncoming ? 'Incoming Call...' : 'Calling...'}
                      </span>
                    ) : (
                      <span>
                        {Math.floor(callDuration / 3600).toString().padStart(2, '0')}:
                        {Math.floor((callDuration % 3600) / 60).toString().padStart(2, '0')}:
                        {(callDuration % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                </>
              )}

              {/* Incoming Call Card */}
              {activeCall.isIncoming && activeCall.status === 'calling' && (
                <div className="fixed inset-0 z-50 bg-dark flex flex-col items-center justify-center p-8">
                  <div className="text-center mb-16">
                    <div className="w-32 h-32 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-8 animate-bounce">
                      {activeCall.type === 'video' ? <Video size={64} className="text-brand" /> : <Phone size={64} className="text-brand" />}
                    </div>
                    <h3 className="text-4xl font-bold mb-2">{activeCall.caller_name || activeCall.caller_username}</h3>
                    <p className="text-xl text-gray-400">{activeCall.caller_role}</p>
                    <p className="text-2xl text-brand mt-8 font-medium animate-pulse">Incoming {activeCall.type} call...</p>
                  </div>
                  <div className="flex justify-center gap-12">
                    <button 
                      onClick={handleRejectCall}
                      className="w-24 h-24 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                      title="Decline"
                    >
                      <PhoneOff size={40} />
                    </button>
                    {activeCall.type === 'video' ? (
                      <div className="flex gap-8">
                        <button 
                          onClick={() => handleAcceptCall(false)}
                          className="w-24 h-24 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center hover:bg-green-500 hover:text-white transition-all animate-pulse"
                          title="Continue with Audio"
                        >
                          <Phone size={40} />
                        </button>
                        <button 
                          onClick={() => handleAcceptCall(true)}
                          className="w-24 h-24 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all animate-pulse"
                          title="Continue with Video"
                        >
                          <Video size={40} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleAcceptCall(true)}
                        className="w-24 h-24 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center hover:bg-green-500 hover:text-white transition-all animate-pulse"
                        title="Accept"
                      >
                        <Phone size={40} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Controls */}
            {(!activeCall.isIncoming || activeCall.status === 'connected') && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-wrap justify-center items-center gap-2 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 z-20 max-w-[90%]">
                <button 
                  onClick={toggleMute}
                  className={`p-3 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-white/10 hover:bg-white/20'}`}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                {activeCall.type === 'video' && (
                  <>
                    <button 
                      onClick={toggleVideo}
                      className={`p-3 rounded-full transition-all ${isVideoOff ? 'bg-red-500/20 text-red-500' : 'bg-white/10 hover:bg-white/20'}`}
                      title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
                    >
                      {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                    </button>
                    <button 
                      onClick={flipCamera}
                      className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                      title="Flip Camera"
                    >
                      <RefreshCw size={20} />
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setIsSpeaker(!isSpeaker)}
                  className={`p-3 rounded-full transition-all ${isSpeaker ? 'bg-brand/20 text-brand' : 'bg-white/10 hover:bg-white/20'}`}
                  title={isSpeaker ? "Speaker Off" : "Speaker On"}
                >
                  <Volume2 size={20} />
                </button>
                <button 
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                  title="Add Participant"
                >
                  <UserPlus size={20} />
                </button>
                <button 
                  onClick={handleEndCall}
                  className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all ml-2"
                  title="Hang Up"
                >
                  <PhoneOff size={20} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized Call Bubble */}
      {activeCall && isMinimized && (
        <div 
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-6 right-6 z-[100] bg-brand text-white p-4 rounded-full shadow-2xl cursor-pointer hover:scale-105 transition-transform flex items-center gap-3 animate-pulse"
        >
          {activeCall.type === 'video' ? <Video size={24} /> : <PhoneCall size={24} />}
          <span className="font-medium">
            {activeCall.status === 'connected' ? (
              `${Math.floor(callDuration / 3600).toString().padStart(2, '0')}:${Math.floor((callDuration % 3600) / 60).toString().padStart(2, '0')}:${(callDuration % 60).toString().padStart(2, '0')}`
            ) : 'Calling...'}
          </span>
        </div>
      )}

      <div className="flex-1 flex flex-col h-[calc(100vh-5rem)]">
        <div className="flex-1 flex overflow-hidden">
          
          {/* Sidebar - Conversations List */}
          <div className={`w-full md:w-80 border-r border-white/5 flex flex-col bg-dark/50 ${activeChat && 'hidden md:flex'}`}>
            <div className="p-6 border-b border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <MessageSquare className="text-brand" />
                  Inbox
                </h2>
                <button
                  onClick={handleProfileRedirect}
                  className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-brand transition-all"
                  title="Go to Dashboard/Profile"
                >
                  {user?.role === 'customer' ? <UserCircle size={20} /> : <LayoutDashboard size={20} />}
                </button>
              </div>
              
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full bg-dark/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-brand outline-none transition-all"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isSearching ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase px-2 mb-2">Search Results</p>
                  {searchResults.length === 0 ? (
                    <p className="text-center text-gray-500 text-sm py-4">No users found</p>
                  ) : (
                    searchResults.map(res => (
                      <button
                        key={res.id}
                        onClick={() => {
                          setActiveChat(res);
                          setSearchQuery('');
                          setIsSearching(false);
                        }}
                        className="w-full text-left p-3 rounded-xl hover:bg-white/5 border border-transparent transition-all flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-dark border border-white/10 flex items-center justify-center shrink-0">
                          <User className="text-gray-400" size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm truncate">{res.name || res.username}</h3>
                          <p className="text-[10px] text-gray-400 capitalize">{res.role}</p>
                        </div>
                      </button>
                    ))
                  )}
                  <button 
                    onClick={() => {
                      setIsSearching(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-center text-brand text-xs py-2 hover:underline"
                  >
                    Back to conversations
                  </button>
                </div>
              ) : conversations.length === 0 ? (
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
                    <div className="w-12 h-12 rounded-full bg-dark border border-white/10 flex items-center justify-center shrink-0 relative">
                      <User className="text-gray-400" />
                      {conv.role === 'admin' && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-brand rounded-full flex items-center justify-center">
                          <Check className="text-dark" size={10} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold truncate text-sm">{conv.name || conv.username}</h3>
                        {conv.last_message_at && (
                          <span className="text-[10px] text-gray-500 whitespace-nowrap ml-2">
                            {new Date(conv.last_message_at).toLocaleDateString() === new Date().toLocaleDateString()
                              ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : new Date(conv.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                            }
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-400 truncate flex-1">
                          {conv.last_message || <span className="italic opacity-50 capitalize">{conv.role}</span>}
                        </p>
                        {conv.unread_count > 0 && (
                          <span className="ml-2 bg-brand text-dark text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
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
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-dark/50">
                  <div className="flex items-center gap-4">
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
                  
                  <div className="flex items-center gap-2">
                    <button 
                      className="p-2 text-gray-400 hover:text-brand transition-colors"
                      title="Audio Call"
                      onClick={() => handleCall('audio')}
                    >
                      <Phone size={20} />
                    </button>
                    <button 
                      className="p-2 text-gray-400 hover:text-brand transition-colors"
                      title="Video Call"
                      onClick={() => handleCall('video')}
                    >
                      <Video size={20} />
                    </button>
                    {/* Product Card Action */}
                    <button 
                      className="p-2 text-gray-400 hover:text-brand transition-colors"
                      title="Add product/package card"
                      onClick={() => alert('Product card selection coming soon!')}
                    >
                      <Plus size={20} />
                    </button>
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
                            <div className={`px-4 py-3 rounded-2xl relative group ${
                              isMe 
                                ? 'bg-brand text-dark rounded-tr-sm' 
                                : 'bg-white/5 border border-white/10 rounded-tl-sm'
                            }`}>
                              {user?.role === 'admin' && (
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Delete Message"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                              {msg.file_url ? (
                                <div className="flex flex-col gap-2">
                                  {msg.file_type?.startsWith('image/') ? (
                                    <img src={msg.file_url} alt={msg.file_name} className="max-w-full rounded-lg max-h-48 object-cover" />
                                  ) : msg.file_type?.startsWith('video/') ? (
                                    <video src={msg.file_url} controls className="max-w-full rounded-lg max-h-48" />
                                  ) : msg.file_type?.startsWith('audio/') ? (
                                    <audio src={msg.file_url} controls className="max-w-full" />
                                  ) : (
                                    <div className="flex items-center gap-2 bg-black/20 p-2 rounded-lg">
                                      <FileIcon size={24} />
                                      <div className="flex flex-col overflow-hidden">
                                        <span className="text-xs font-bold truncate">{msg.file_name}</span>
                                        <span className="text-[10px] opacity-70">{(msg.file_size / 1024 / 1024).toFixed(2)} MB</span>
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex justify-between items-center mt-1">
                                    <p className="whitespace-pre-wrap break-words text-sm">{renderMessageContent(msg.content)}</p>
                                    <a href={msg.file_url} download={msg.file_name} className="p-1 hover:bg-black/10 rounded" title="Download">
                                      <Download size={16} />
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap break-words text-sm">{renderMessageContent(msg.content)}</p>
                              )}
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
                <div className="p-2 md:p-4 border-t border-white/5 bg-dark/50 shrink-0">
                  <form onSubmit={handleSendMessage} className="flex gap-1 md:gap-2 items-center">
                    <label className="bg-dark border border-white/10 p-2 md:p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0">
                      <Paperclip size={18} className="md:size-5 text-gray-400" />
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={handleFileUpload}
                        title="Attach file (max 10MB)"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`p-2 md:p-3 rounded-xl transition-all shrink-0 ${isRecording ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-dark border border-white/10 hover:bg-white/5 text-gray-400'}`}
                      title={isRecording ? "Stop Recording" : "Record Voice Message"}
                    >
                      <Mic size={18} className="md:size-5" />
                    </button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type your message..."
                      className="flex-1 min-w-0 bg-dark border border-white/10 rounded-xl px-3 md:px-4 py-2 md:py-3 focus:border-brand outline-none transition-all text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim()}
                      className="bg-brand text-dark p-2 md:p-3 rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center shrink-0"
                    >
                      <Send size={18} className="md:size-5" />
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
                {user.role !== 'customer' && (
                  <p className="text-sm">Use the search bar to find customers to message</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
