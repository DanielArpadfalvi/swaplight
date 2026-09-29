package com.example.projectkickoff.api;

import com.example.projectkickoff.api.KickoffDtos.ErrorResponse;
import com.example.projectkickoff.service.KickoffConflictException;
import com.example.projectkickoff.service.KickoffNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;

/** Csak a projektindítás controllerre vonatkozik, a meglévő alkalmazás hibakezelését nem érinti. */
@RestControllerAdvice(assignableTypes = ProjectKickoffController.class)
public class KickoffExceptionHandler {

    @ExceptionHandler(KickoffNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse notFound(KickoffNotFoundException e) {
        return new ErrorResponse(e.getMessage(), List.of());
    }

    @ExceptionHandler(KickoffConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ErrorResponse conflict(KickoffConflictException e) {
        return new ErrorResponse(e.getMessage(), List.of());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse badRequest(IllegalArgumentException e) {
        return new ErrorResponse(e.getMessage(), List.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse invalid(MethodArgumentNotValidException e) {
        List<String> details = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .toList();
        return new ErrorResponse("Hibás adatok", details);
    }
}
