// Конфигурация вариантов игры. Ядро параметризовано — 4×4 добавляется здесь же.
export const VARIANTS = {
  gobblers3: {
    id: 'gobblers3', name: 'Gobblers 3×3',
    boardSize: 3, sizes: 3, piecesPerSize: 2,
    reserve: 'loose',         // 'loose' (россыпь) | 'stacks' (стопки, 4×4)
    reserveGobbleRule: false, // спец-правило накрытия из резерва (4×4)
    palette: 'rb',            // цвета фишек: красные/синие
    playerNames: ['Красные', 'Синие'],
    // winLength = boardSize
  },
  classic4: {
    id: 'classic4', name: 'Classic 4×4',
    boardSize: 4, sizes: 4, piecesPerSize: 3,
    reserve: 'stacks', reserveGobbleRule: true,
    palette: 'bw',           // как в шахматах: белые (бежевые) / чёрные
    playerNames: ['Белые', 'Чёрные'],
  },
};
