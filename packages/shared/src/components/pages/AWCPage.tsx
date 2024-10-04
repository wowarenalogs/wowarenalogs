import { useState } from 'react';

import EU_TWW_S1C1 from '../../data/awc/EU_TWW_S1C1.json';
import NA_TWW_S1C1 from '../../data/awc/NA_TWW_S1C1.json';

export const AWCPage = () => {
  const [region, setRegion] = useState('NA');

  const data = region === 'NA' ? NA_TWW_S1C1 : EU_TWW_S1C1;

  const allGames = [
    ...Object.values(data.segments.upper.rounds).flat(),
    ...Object.values(data.segments.lower.rounds).flat(),
  ]
    .flatMap((match) => match.games.map((game) => ({ ...game, match })))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div>
      <h1 style={{ textAlign: 'center' }}>AWC: The War Within Season 1 Cup 1</h1>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button onClick={() => setRegion(region === 'NA' ? 'EU' : 'NA')}>
          Switch to {region === 'NA' ? 'EU' : 'NA'}
        </button>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
        <table>
          <caption>Match Results - {region} Region</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Bracket</th>
              <th>Round</th>
              <th>Winner</th>
              <th>Winner Composition</th>
              <th>Loser</th>
              <th>Loser Composition</th>
              <th>Game</th>
              <th>Game ID</th>
              <th>Dungeon</th>
            </tr>
          </thead>
          <tbody>
            {allGames
              .filter((game) => game.dungeon !== null)
              .map((game, index) => {
                const match = game.match;
                const team1 = match.firstTeam;
                const team2 = match.secondTeam;
                const winnerTeam = game.winnerTeamId === team1.id ? team1 : team2;
                const loserTeam = game.winnerTeamId === team1.id ? team2 : team1;
                const winnerRoster = game.winnerTeamId === team1.id ? game.firstTeamRoster : game.secondTeamRoster;
                const loserRoster = game.winnerTeamId === team1.id ? game.secondTeamRoster : game.firstTeamRoster;
                const gameDate = new Date(game.updatedAt).toLocaleString();

                const formatComposition = (roster) => {
                  return roster.map(player => `${player.name} (${player.class} - ${player.spec})`).join(', ');
                };

                return (
                  <tr key={`${match.id}-${game.id}`}>
                    <td>{gameDate}</td>
                    <td>{match.position}</td>
                    <td>{match.round}</td>
                    <td>{winnerTeam.name}</td>
                    <td>{formatComposition(winnerRoster)}</td>
                    <td>{loserTeam.name}</td>
                    <td>{formatComposition(loserRoster)}</td>
                    <td>{match.games.findIndex((g) => g.id === game.id) + 1}</td>
                    <td>{game.id}</td>
                    <td>{game.dungeon.name}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
