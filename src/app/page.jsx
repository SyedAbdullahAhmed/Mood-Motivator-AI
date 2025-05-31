"use client";

import { useState, useEffect, useRef } from 'react';

// A simple microphone icon SVG (same as before)
const MicrophoneIcon = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z" />
  </svg>
);

// Speaker icon for replaying audio
const SpeakerIcon = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);


export default function MoodMotivatorPage() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [motivation, setMotivation] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState(null);
  const [isLoadingMotivation, setIsLoadingMotivation] = useState(false);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(true);


  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || (window ).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setError("Your browser doesn't support speech recognition. Try Chrome or Edge.");
      setSpeechRecognitionSupported(false);
      return;
    }
    setSpeechRecognitionSupported(true);

    const recognitionInstance = new SpeechRecognitionAPI();
    recognitionInstance.continuous = false;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = 'en-US';

    recognitionInstance.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
      setTranscript(''); // Clear previous final transcript
      setMotivation(null);
      setAudioUrl(null); // Clear previous audio
      setError(null);
    };

    recognitionInstance.onresult = (event) => {
      let finalTranscriptSegment = '';
      let currentInterim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscriptSegment += event.results[i][0].transcript;
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }
      setInterimTranscript(currentInterim);
      if (finalTranscriptSegment) {
        setTranscript(prev => prev + finalTranscriptSegment);
      }
    };

    recognitionInstance.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      let specificError = `Error: ${event.error}`;
      if (event.error === 'no-speech') specificError = "No speech was detected. Please try again.";
      else if (event.error === 'audio-capture') specificError = "Microphone problem. Ensure it's working and permission is granted.";
      else if (event.error === 'not-allowed') specificError = "Permission to use microphone was denied. Please enable it in browser settings.";
      setError(specificError);
      setIsListening(false);
    };

    recognitionInstance.onend = () => {
      setIsListening(false);
      // The logic to fetch motivation will be triggered by the useEffect watching `transcript` and `isListening`
    };

    recognitionRef.current = recognitionInstance;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort(); // Use abort for immediate stop
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl); // Clean up blob URL
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleToggleListen = () => {
    if (!recognitionRef.current || !speechRecognitionSupported) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');
      setInterimTranscript('');
      setMotivation(null);
      setAudioUrl(null);
      setError(null);
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error("Error starting recognition:", err);
        setError("Could not start voice recognition. Is another app using the microphone?");
        setIsListening(false); // Ensure state is correct
      }
    }
  };

  // Effect to fetch motivation when final transcript is ready AND listening has stopped
  useEffect(() => {
    if (transcript.trim() && !isListening && !isLoadingMotivation) {
      const getMotivationAndAudio = async () => {
        setIsLoadingMotivation(true);
        setError(null);
        setMotivation(null);
        setAudioUrl(null); // Clear previous audio

        if (audioUrl) { // Clean up previous blob URL if any
          URL.revokeObjectURL(audioUrl);
        }

        try {
          const response = await fetch('/api/generate-motivation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: transcript }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Server error with non-JSON response." }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
          }

          // Extract quote and role model from headers
          const quote = decodeURIComponent(response.headers.get('X-Quote') || "Could not retrieve quote.");
          const roleModel = decodeURIComponent(response.headers.get('X-RoleModel') || "Could not retrieve role model.");
          setMotivation({ quote, roleModel });

          // Get audio blob
          const audioBlob = await response.blob();
          const newAudioUrl = URL.createObjectURL(audioBlob);
          setAudioUrl(newAudioUrl);

          // Autoplay audio
          if (audioPlayerRef.current) {
            audioPlayerRef.current.src = newAudioUrl;
             audioPlayerRef.current.playbackRate = 0.80;
            audioPlayerRef.current.play().catch(e => console.warn("Autoplay prevented:", e));
          }

        } catch (e) {
          console.error("Failed to fetch motivation:", e);
          setError(e.message || "Failed to fetch motivation or audio. Please try again.");
          setMotivation(null);
          setAudioUrl(null);
        }
        setIsLoadingMotivation(false);
      };
      getMotivationAndAudio();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, isListening]); // Rerun when transcript changes or listening state changes


  const handleReplayAudio = () => {
    if (audioPlayerRef.current && audioUrl) {
      audioPlayerRef.current.play().catch(e => console.warn("Replay prevented:", e));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-4 sm:p-8 transition-colors duration-300">
      <div className="bg-white w-full max-w-2xl p-6 sm:p-10 rounded-xl shadow-2xl space-y-8">
        <header className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800">
            Mood Motivator
          </h1>
          <p className="text-slate-600 mt-2 text-sm sm:text-base">
            Tell me how you feel, and I'll find some inspiration for you.
          </p>
        </header>

        <div className="flex flex-col items-center space-y-6">
          <button
            onClick={handleToggleListen}
            disabled={!speechRecognitionSupported || isLoadingMotivation}
            className={`
              p-5 sm:p-6 rounded-full cursor-pointer transition-all duration-300 ease-in-out
              focus:outline-none focus:ring-4 active:scale-95
              ${isListening
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse focus:ring-red-300'
                : 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-300'
              }
              disabled:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-70
            `}
            aria-label={isListening ? "Stop listening" : "Start listening"}
          >
            <MicrophoneIcon className="w-8 h-8 sm:w-10 sm:h-10" />
          </button>
          <p className="text-sm text-slate-500 h-5">
            {isLoadingMotivation ? "Finding inspiration..." :
             isListening ? "Listening..." :
             (transcript ? "Click to speak again" : (speechRecognitionSupported ? "Click the mic to speak" : "Voice input not supported"))}
          </p>
        </div>

        {(transcript || interimTranscript) && !isLoadingMotivation && (
          <div className="mt-6 p-4 border border-slate-200 rounded-md bg-slate-50 w-full min-h-[60px] text-slate-700">
            <p className="font-semibold mb-1">You said:</p>
            <p>
              {transcript}
              {interimTranscript && <span className="text-slate-400">{interimTranscript}</span>}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-6 p-3 bg-red-100 border border-red-300 text-red-700 rounded-md text-center">
            <p>{error}</p>
          </div>
        )}

        {isLoadingMotivation && (
          <div className="mt-6 text-center text-red-600 flex items-center justify-center space-x-2">
            <svg className="animate-spin h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Finding inspiration for you...</span>
          </div>
        )}

        {motivation && !isLoadingMotivation && (
          <div className="mt-8 p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-lg shadow-md space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-red-700 mb-1">Motivational Quote:</h3>
              <blockquote className="border-l-4 border-red-500 pl-4 italic text-slate-700">
                "{motivation.quote}"
              </blockquote>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-700 mb-1">Inspired by:</h3>
              <p className="text-slate-700 font-medium">{motivation.roleModel}</p>
            </div>
            {audioUrl && (
                <button
                    onClick={handleReplayAudio}
                    className="mt-4 flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-300"
                    aria-label="Replay audio"
                >
                    <SpeakerIcon className="w-5 h-5" />
                    <span>Replay Quote</span>
                </button>
            )}
          </div>
        )}
      </div>
      <audio ref={audioPlayerRef} hidden /> {/* Hidden audio player */}
      <footer className="text-center mt-10 text-slate-500 text-xs">
        <p>Speech recognition works best in Chrome or Edge.</p>
        <p>© {new Date().getFullYear()} Mood Motivator App</p>
      </footer>
    </div>
  );
}