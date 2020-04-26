import { GameCommand } from "./game.command";
import { GameState } from "../models/game-state.model";
import { Value } from "../models/values.model";
import { isValidColor, Color } from "../models/color.model";
import { CommandValidation } from "./command-result";
import { AfterPlayCardEvent } from "../events/after-play-card.event";
import { Player } from "../models/player.model";
import { Card } from "../models/card.model";
import { GameEndEvent } from "../events/game-end.event";
import { AfterTakeCardsEvent } from "../events/after-take-cards.event";

export class PlayCardCommand extends GameCommand {
  private readonly playerId: string;
  private readonly cardId: string;

  constructor(playerId: string, cardId: string) {
    super();

    this.playerId = playerId;
    this.cardId = cardId;
  }

  execute(state: GameState) {
    const player = state.playersGroup.getPlayerById(this.playerId) as Player;

    const cardToPlay = player.hand.cards.find(
      (handCard) => handCard.id === this.cardId
    ) as Card;

    if (
      cardToPlay?.value === Value.WILDCARD ||
      cardToPlay?.value === Value.PLUS_FOUR
    ) {
      let newColor;
      // TODO: Cambiar el metodo de entrada del color
      while (!isValidColor(newColor as Color)) {
        newColor = prompt(
          "Escribe el nuevo color a jugar: azul, rojo, verde o amarillo"
        );
      }

      cardToPlay.setColor(newColor as Color);
    }

    state.turn.player?.hand.removeCard(cardToPlay);

    state.stack.addCard(cardToPlay);

    console.log(
      `El jugador ${state.turn.player?.id} ha tirado la carta ${this.cardId} al stack`
    );

    if (
      state.turn.player?.hand.cards.length === 0 &&
      state.unoYellers[state.turn.player?.id]
    ) {
      const score = state.playersGroup.players
        .filter((player) => player.id !== state.turn.player?.id)
        .reduce((score, player) => {
          score += player.hand.score;

          return score;
        }, 0);

      this.events.dispatchGameEnd(new GameEndEvent(state.turn.player, score));
    }

    state.checkForPlayersWhoShouldHaveYelledUno();

    if (state.stack.cardOnTop?.value === Value.PLUS_FOUR) {
      // Es importante el orden en que se aplica los efectos.
      // Primero se aplica +4 y luego saltea turno.
      const newCards = state.giveCards(4, state.nextPlayerToPlay);

      this.events.dispatchAfterTakeCards(
        new AfterTakeCardsEvent(newCards, state.nextPlayerToPlay)
      );

      state.turn.setPlayerTurn(state.nextPlayerToPlay);
    }

    if (state.stack.cardOnTop?.value === Value.PLUS_TWO) {
      state.cardsToGive += 2;

      const nextPlayerHasPlusTwo = state.nextPlayerToPlay.hand.hasCard(
        Value.PLUS_TWO
      );

      if (!nextPlayerHasPlusTwo) {
        const newCards = state.giveCards(state.cardsToGive, state.nextPlayerToPlay);

        this.events.dispatchAfterTakeCards(
          new AfterTakeCardsEvent(newCards, state.nextPlayerToPlay)
        );

        state.cardsToGive = 0;

        state.turn.setPlayerTurn(state.nextPlayerToPlay);
      }
    }

    if (state.stack.cardOnTop?.value === Value.SKIP) {
      state.turn.setPlayerTurn(state.nextPlayerToPlay);
    }

    if (state.stack.cardOnTop?.value === Value.REVERSE) {
      state.changeDirection();

      if (state.playersGroup.players.length === 2) {
        // si son dos jugadores entonces funciona como SKIP
        state.turn.setPlayerTurn(state.nextPlayerToPlay);
      }
    }

    this.events.dispatchAfterPlayCard(
      new AfterPlayCardEvent(cardToPlay, player)
    );
  }

  validate(state: GameState) {
    const player = state.playersGroup.getPlayerById(this.playerId);

    if (!player) {
      return new CommandValidation(
        false,
        "No ha sido posible encontrar al jugador en la partida"
      );
    }

    if (!state.turn.player) {
      return new CommandValidation(false, "No hay un turno activo");
    }

    if (player.id !== state.turn.player.id) {
      return new CommandValidation(false, "No es el turno del jugador");
    }

    const cardToPlay = player.hand.cards.find(
      (handCard) => handCard.id === this.cardId
    );

    if (!cardToPlay) {
      return new CommandValidation(
        false,
        "No se ha encontrado la carta de la mano del jugador"
      );
    }

    if (
      state.stack.cardOnTop?.value === Value.PLUS_TWO &&
      cardToPlay.value !== Value.PLUS_TWO &&
      state.cardsToGive > 0
    ) {
      return new CommandValidation(false, "La carta que quiere tirar no es +2");
    }

    if (
      state.stack.cardOnTop &&
      !cardToPlay?.isPlayable(state.stack.cardOnTop)
    ) {
      return new CommandValidation(
        false,
        "La carta que quiere tirar no tiene el mismo color o valor que la del stack"
      );
    }

    return new CommandValidation(true);
  }
}
