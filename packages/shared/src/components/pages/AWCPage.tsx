import React, { useState } from 'react';
import NA_TWW_S1C1 from '../../data/awc/NA_TWW_S1C1.json';

export const AWCPage = () => {
  const [sortByTime, setSortByTime] = useState(false);

  const allMatches = [
    ...Object.values(NA_TWW_S1C1.segments.upper.rounds).flat(),
    ...Object.values(NA_TWW_S1C1.segments.lower.rounds).flat(),
  ];

  const sortedMatches = sortByTime
    ? allMatches.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    : allMatches.sort((a, b) => {
        if (a.position === b.position) {
          return b.round - a.round;
        }
        return a.position === 'upper' ? -1 : 1;
      });

  const toggleSortOption = () => {
    setSortByTime((prevState) => !prevState);
  };

  return (
    <div>
      <h1>AWC Matches</h1>
      <button onClick={toggleSortOption}>
        Sort by {sortByTime ? 'Bracket and Round' : 'Time'}
      </button>
      <table>
        <thead>
          <tr>
            <th>Bracket</th>
            <th>Round</th>
            <th>Winner</th>
            <th>Loser</th>
            <th>Map</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {sortedMatches.map((match) => {
            const winnerTeam = match.winnerTeamId === match.firstTeam.id ? match.firstTeam : match.secondTeam;
            const loserTeam = match.winnerTeamId === match.firstTeam.id ? match.secondTeam : match.firstTeam;
            const lastGame = match.games[match.games.length - 1];
            const mapName = lastGame.dungeon ? lastGame.dungeon.name : 'N/A';
            const matchTime = new Date(match.updatedAt).toLocaleString();

            return (
              <tr key={match.id}>
                <td>{match.position}</td>
                <td>{match.round}</td>
                <td>{winnerTeam.name}</td>
                <td>{loserTeam.name}</td>
                <td>{mapName}</td>
                <td>{matchTime}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
