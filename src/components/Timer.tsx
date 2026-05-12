import { useEffect } from 'react';
import { Clock } from 'lucide-react';

interface TimerProps {
  timeRemaining: number;
  isActive: boolean;
  color: 'white' | 'black';
  playerUsername?: string;
  onTimeUp?: () => void;
}

export default function Timer({ timeRemaining, isActive, color, playerUsername, onTimeUp }: TimerProps) {
  useEffect(() => {
    if (timeRemaining <= 0 && isActive) {
      onTimeUp?.();
    }
  }, [timeRemaining, isActive, onTimeUp]);

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);

  const formatTime = (time: number) => {
    return time < 10 ? `0${time}` : `${time}`;
  };

  const isLowTime = timeRemaining < 60;
  const isCritical = timeRemaining < 10;

  return (
    <div
      className={`
        rounded-lg p-2 sm:p-4 transition-all duration-300 w-full flex-1 min-w-0
        ${isActive ? 'ring-2 sm:ring-4 ring-yellow-400 shadow-lg scale-[1.02] sm:scale-105' : ''}
        ${color === 'white' ? 'bg-gray-100' : 'bg-gray-800'}
        ${isCritical ? 'animate-pulse' : ''}
      `}
    >
      <div className={`text-xs sm:text-sm font-semibold mb-1 truncate ${color === 'white' ? 'text-gray-700' : 'text-gray-300'}`}>
        {playerUsername ? playerUsername : color.charAt(0).toUpperCase() + color.slice(1)}
      </div>
      <div
        className={`
          flex items-center gap-1 sm:gap-2 text-lg sm:text-3xl font-bold font-mono
          ${isCritical ? 'text-red-600' : isLowTime ? 'text-orange-600' : color === 'white' ? 'text-gray-900' : 'text-white'}
        `}
      >
        <Clock className="w-4 h-4 sm:w-8 sm:h-8 shrink-0" />
        <span className="truncate">{formatTime(minutes)}:{formatTime(seconds)}</span>
      </div>
    </div>
  );
}
