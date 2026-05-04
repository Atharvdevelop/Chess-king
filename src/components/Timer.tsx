import { Clock } from 'lucide-react';

interface TimerProps {
  timeRemaining: number;
  isActive: boolean;
  color: 'white' | 'black';
  playerUsername?: string;
}

export default function Timer({ timeRemaining, isActive, color, playerUsername }: TimerProps) {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  const formatTime = (time: number) => {
    return time < 10 ? `0${time}` : `${time}`;
  };

  const isLowTime = timeRemaining < 60;
  const isCritical = timeRemaining < 10;

  return (
    <div
      className={`
        rounded-lg p-4 transition-all duration-300
        ${isActive ? 'ring-4 ring-yellow-400 shadow-lg scale-105' : ''}
        ${color === 'white' ? 'bg-gray-100' : 'bg-gray-800'}
        ${isCritical ? 'animate-pulse' : ''}
      `}
    >
      <div className={`text-sm font-semibold mb-1 ${color === 'white' ? 'text-gray-700' : 'text-gray-300'}`}>
        {playerUsername ? playerUsername : color.charAt(0).toUpperCase() + color.slice(1)}
      </div>
      <div
        className={`
          flex items-center gap-2 text-3xl font-bold font-mono
          ${isCritical ? 'text-red-600' : isLowTime ? 'text-orange-600' : color === 'white' ? 'text-gray-900' : 'text-white'}
        `}
      >
        <Clock className="w-8 h-8" />
        <span>{formatTime(minutes)}:{formatTime(seconds)}</span>
      </div>
    </div>
  );
}
