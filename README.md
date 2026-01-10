# Chess Online - Multiplayer Chess Game

A real-time multiplayer chess game built with React, TypeScript, Supabase, and Vite.

## Features

- Real-time multiplayer chess gameplay
- Beautiful, responsive chess board interface
- Game lobby with matchmaking
- Move history tracking
- Persistent game state with Supabase
- Real-time synchronization between players

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Realtime)
- **Build Tool**: Vite
- **Icons**: Lucide React
- **Deployment**: Vercel

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example` and add your Supabase credentials

4. Start the development server:
   ```bash
   npm run dev
   ```

## Deploying to Vercel

### Prerequisites
- A Vercel account
- Your Supabase project credentials (URL and anon key)

### Deployment Steps

1. **Install Vercel CLI** (optional):
   ```bash
   npm install -g vercel
   ```

2. **Deploy via Vercel CLI**:
   ```bash
   vercel
   ```
   Follow the prompts to link your project.

3. **Or deploy via Vercel Dashboard**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your Git repository
   - Vercel will automatically detect the `vercel.json` configuration

4. **Configure Environment Variables** in Vercel:
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add the following variables:
     - `VITE_SUPABASE_URL`: Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

5. **Deploy**:
   - Vercel will automatically build and deploy your application
   - Your app will be live at `https://your-project.vercel.app`

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Database Setup

The application automatically creates the required database tables on first migration:
- `players`: Stores player information
- `games`: Stores game state and status
- `moves`: Stores move history

## How to Play

1. Enter a username to start
2. Create a new game or join an existing one
3. Share the game link with a friend
4. Play chess in real-time!

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## License

MIT
